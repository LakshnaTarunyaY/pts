"""
MediKiosk — Patient Portal API
Serves patient profile, active OPD tokens, past medical history, and prescription uploads.
"""

import json
import uuid
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from app.database import get_db
from app.core.security.session import require_patient_session

logger = logging.getLogger("medikiosk.api.patient")
router = APIRouter(prefix="/api/patient", tags=["Patient Portal"])


@router.get("/dashboard/{identifier}")
async def get_patient_dashboard(
    identifier: str,
    session=Depends(require_patient_session),
    db=Depends(get_db),
):
    """
    Fetch comprehensive patient health record and active OPD status.
    Requires patient session. Identifier must match the logged-in patient ABHA/id.
    """
    session_abha = (session.get("abha_id") or "").strip()
    session_uid = session.get("user_id")
    ident = identifier.strip()

    if ident not in (session_abha, session_uid) and ident != session_abha:
        # Also allow normalized match via DB for the session user only
        cursor = await db.execute(
            "SELECT id, abha_id FROM users WHERE id = ?",
            (session_uid,),
        )
        me = await cursor.fetchone()
        allowed = {me["id"], me["abha_id"]} if me else {session_uid, session_abha}
        if ident not in allowed:
            raise HTTPException(
                status_code=403,
                detail={"code": "ACCESS_DENIED", "message": "Cannot view another patient's records"},
            )
    # 1. Fetch patient profile (structured EMR fields)
    cursor = await db.execute("""
        SELECT id, full_name, mobile, abha_id, email, hospital_name, hospital_phone, created_at,
               date_of_birth, age, gender, city, emergency_contact, blood_group,
               allergy_food, allergy_drug, allergy_environmental,
               current_medications, pre_existing_conditions, chronic_diseases,
               surgical_history, medical_history
        FROM users
        WHERE role = 'patient' AND (id = ? OR mobile = ? OR abha_id = ?)
    """, (identifier, identifier, identifier))
    user_row = await cursor.fetchone()

    if not user_row:
        raise HTTPException(
            status_code=404,
            detail={"code": "ABHA_NOT_REGISTERED", "message": "Patient profile not found."},
        )
    else:
        user_profile = dict(user_row)
        user_profile.pop("password_hash", None)

    patient_id = user_profile["id"]
    abha_id = user_profile.get("abha_id")

    # 2. Fetch all encounters linked to patient_id or abha_id
    cursor = await db.execute("""
        SELECT e.*, 
               u.full_name as doctor_name, 
               u.department as doctor_department, 
               u.room_number as doctor_room,
               u.hospital_phone as doctor_phone
        FROM encounters e
        LEFT JOIN users u ON e.verified_by_doctor_id = u.id
        WHERE e.patient_id = ? OR (e.abha_id IS NOT NULL AND e.abha_id = ?)
        ORDER BY e.created_at DESC
    """, (patient_id, abha_id))
    encounters = [dict(row) for row in await cursor.fetchall()]

    # 3. Fetch active queue token if any
    active_token = None
    if encounters:
        latest_enc_id = encounters[0]["id"]
        cursor = await db.execute("""
            SELECT q.*, e.department as enc_department
            FROM queue_tokens q
            JOIN encounters e ON q.encounter_id = e.id
            WHERE q.encounter_id = ? AND q.status != 'COMPLETED'
            ORDER BY q.created_at DESC LIMIT 1
        """, (latest_enc_id,))
        token_row = await cursor.fetchone()
        if token_row:
            active_token = dict(token_row)
            cursor = await db.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM queue_tokens qt
                JOIN encounters e ON e.id = qt.encounter_id
                WHERE qt.department = ? AND qt.status = 'WAITING'
                  AND e.status IN ('COMPLETED', 'IN_PROGRESS')
                  AND qt.position < ? AND qt.token != ?
                """,
                (active_token["department"], active_token["position"], active_token["token"]),
            )
            patients_ahead = (await cursor.fetchone())["cnt"]
            active_token["patients_ahead"] = patients_ahead
            # ~3 minutes per waiting patient, matching the OPD queue tracker heuristic
            active_token["estimated_wait_minutes"] = patients_ahead * 3

    # 4. Attach clinical facts and documents to encounters
    detailed_history = []
    seen_doc_ids = set()
    all_documents = []

    for enc in encounters:
        enc_id = enc["id"]
        # Fetch facts
        f_cursor = await db.execute("SELECT * FROM clinical_facts WHERE encounter_id = ?", (enc_id,))
        facts = [dict(f) for f in await f_cursor.fetchall()]

        # Fetch documents linked to this encounter
        d_cursor = await db.execute("SELECT * FROM documents WHERE encounter_id = ?", (enc_id,))
        docs = [dict(d) for d in await d_cursor.fetchall()]
        for d in docs:
            if d["id"] not in seen_doc_ids:
                seen_doc_ids.add(d["id"])
                all_documents.append(d)

        detailed_history.append({
            "encounter_id": enc_id,
            "date": enc["created_at"],
            "token_number": enc["token_number"],
            "department": enc["department"],
            "severity_badge": enc["severity_badge"],
            "status": enc["status"],
            "doctor_verification": {
                "is_verified": enc["verified_by_doctor_id"] is not None or enc["status"] == "DOCTOR_REVIEWED",
                "doctor_name": enc.get("doctor_name"),
                "department": enc.get("doctor_department") or enc["department"],
                "room_number": enc.get("doctor_room"),
                "doctor_notes": enc.get("doctor_notes"),
                "reviewed_at": enc.get("doctor_reviewed_at")
            },
            "facts": facts,
            "document_count": len(docs),
            "ayush_intake": (
                json.loads(enc["ayush_intake"]) if enc.get("ayush_intake") else None
            )
        })

    # Always include longitudinal documents linked to this patient / ABHA
    # (portal uploads, registration uploads) so they survive future logins.
    d_cursor = await db.execute(
        """
        SELECT * FROM documents
        WHERE patient_id = ? OR (abha_id IS NOT NULL AND abha_id = ?)
        ORDER BY COALESCE(document_date, created_at) DESC, created_at DESC
        """,
        (patient_id, abha_id),
    )
    for d in await d_cursor.fetchall():
        row = dict(d)
        if row["id"] not in seen_doc_ids:
            seen_doc_ids.add(row["id"])
            all_documents.append(row)

    # Newest first for the locker UI
    all_documents.sort(
        key=lambda d: d.get("document_date") or d.get("created_at") or "",
        reverse=True,
    )

    return {
        "patient": user_profile,
        "profile": user_profile,
        "active_token": active_token,
        "encounters": detailed_history,
        "documents": all_documents
    }


@router.post("/document/upload")
async def upload_patient_document(
    document: UploadFile = File(...),
    document_type: str = Form("prescription"),
    patient_id: Optional[str] = Form(None),
    identifier: Optional[str] = Form(None),
    session=Depends(require_patient_session),
    db=Depends(get_db)
):
    """Allow patient to upload past prescriptions or lab reports from the Patient Portal."""
    lookup = (patient_id or identifier or session.get("abha_id") or session.get("user_id") or "").strip()
    if not lookup:
        raise HTTPException(status_code=400, detail="patient_id or identifier is required")

    # Force uploads to the authenticated patient only
    session_uid = session["user_id"]
    cursor = await db.execute(
        "SELECT id, abha_id FROM users WHERE role = 'patient' AND id = ?",
        (session_uid,),
    )
    user = await cursor.fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    if lookup not in (user["id"], user["abha_id"], session.get("abha_id")):
        raise HTTPException(
            status_code=403,
            detail={"code": "ACCESS_DENIED", "message": "Cannot upload documents for another patient"},
        )

    resolved_patient_id = user["id"]
    abha_id = user["abha_id"]
    original_filename = Path(document.filename or "upload.bin").name

    content = await document.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file upload")

    # Soft size guard (~15 MB) — keeps edge SQLite + static disk healthy
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB)")

    doc_id = f"doc-{uuid.uuid4().hex[:8]}"
    ext = Path(original_filename).suffix.lower() or ".bin"
    # Normalize odd extensions from phone cameras
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".pdf", ".heic"}:
        ext = ".bin"

    save_dir = Path("./static/uploads")
    save_dir.mkdir(parents=True, exist_ok=True)
    file_path = save_dir / f"{doc_id}{ext}"
    file_path.write_bytes(content)
    file_url = f"/static/uploads/{doc_id}{ext}"

    # Prefer an existing encounter for this patient; otherwise create a portal-only stub
    # (no queue_token → does not appear in the doctor OPD waiting list).
    cursor = await db.execute(
        """
        SELECT id FROM encounters
        WHERE patient_id = ? OR (abha_id IS NOT NULL AND abha_id = ?)
        ORDER BY created_at DESC LIMIT 1
        """,
        (resolved_patient_id, abha_id),
    )
    enc = await cursor.fetchone()
    encounter_id = enc["id"] if enc else f"enc-portal-{uuid.uuid4().hex[:8]}"

    if not enc:
        await db.execute(
            """
            INSERT INTO encounters (id, patient_id, abha_id, token_number, channel, status, department)
            VALUES (?, ?, ?, ?, 'portal_upload', 'COMPLETED', 'Patient Portal')
            """,
            (encounter_id, resolved_patient_id, abha_id, f"P-{uuid.uuid4().hex[:4].upper()}"),
        )

    # Persist only — do not invoke RapidOCR/ONNX here.
    # Native OCR can hard-crash uvicorn --reload workers (connection reset / 500).
    # Clinical OCR remains available via the kiosk /api/documents/upload pipeline.
    ocr_status = "STORED"
    ocr_text = ""
    ocr_lines = "[]"

    try:
        try:
            await db.execute(
                """
                INSERT INTO documents (
                    id, encounter_id, patient_id, abha_id, file_path, ocr_status, ocr_raw_text,
                    ocr_lines, highlighted_path, document_type, document_date, original_filename
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
                """,
                (
                    doc_id,
                    encounter_id,
                    resolved_patient_id,
                    abha_id,
                    file_url,
                    ocr_status,
                    ocr_text,
                    ocr_lines,
                    file_url,
                    document_type or "other",
                    original_filename,
                ),
            )
        except Exception as col_err:
            # Older DB without original_filename column — still persist the file row
            if "original_filename" not in str(col_err):
                raise
            await db.execute(
                """
                INSERT INTO documents (
                    id, encounter_id, patient_id, abha_id, file_path, ocr_status, ocr_raw_text,
                    ocr_lines, highlighted_path, document_type, document_date
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """,
                (
                    doc_id,
                    encounter_id,
                    resolved_patient_id,
                    abha_id,
                    file_url,
                    ocr_status,
                    ocr_text,
                    ocr_lines,
                    file_url,
                    document_type or "other",
                ),
            )
        await db.execute(
            """
            INSERT INTO audit_log (encounter_id, actor, action, details)
            VALUES (?, ?, 'patient_document_upload', ?)
            """,
            (
                encounter_id,
                f"patient:{abha_id or resolved_patient_id}",
                json.dumps({
                    "document_id": doc_id,
                    "document_type": document_type,
                    "original_filename": original_filename,
                    "bytes": len(content),
                }),
            ),
        )
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to persist patient document {doc_id}: {e}")
        # Clean up orphaned file if DB write failed
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail={"code": "UPLOAD_FAILED", "message": "Could not save document. Please try again."},
        )

    logger.info(
        f"Patient document stored: {doc_id} for {resolved_patient_id} "
        f"({original_filename}, {len(content)} bytes, ocr={ocr_status})"
    )

    return {
        "document_id": doc_id,
        "status": "SUCCESS",
        "ocr_status": ocr_status,
        "file_url": file_url,
        "original_filename": original_filename,
        "document_type": document_type or "other",
        "raw_text": ocr_text,
    }
