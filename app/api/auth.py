"""
MediKiosk — ID-based Authentication & Registration API
Patient login: ABHA ID only. Doctor login: Doctor ID only.
No password / OTP / email login in the primary flow.
"""

import json
import re
import uuid
import logging
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Header
from pydantic import BaseModel, Field

from app.database import get_db
from app.core.security.session import create_session, revoke_session, _extract_bearer

logger = logging.getLogger("medikiosk.api.auth")
router = APIRouter(prefix="/api/auth", tags=["Authentication & Directory"])

ABHA_PATTERN = re.compile(r"^\d{2}-\d{4}-\d{4}-\d{4}$")
UPLOAD_DIR = Path("./static/uploads")


def _public_user(row) -> dict:
    """Return user dict without internal secrets."""
    if row is None:
        return {}
    data = dict(row)
    data.pop("password_hash", None)
    return data


def _error(status_code: int, code: str, message: str):
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _normalize_abha(value: str) -> str:
    raw = (value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 14:
        return f"{digits[:2]}-{digits[2:6]}-{digits[6:10]}-{digits[10:14]}"
    return raw


def _generate_abha() -> str:
    a = uuid.uuid4().hex[:4]
    b = uuid.uuid4().hex[:4]
    c = f"{uuid.uuid4().int % 10000:04d}"
    return f"91-{a}-{b}-{c}"


def _generate_doctor_id() -> str:
    return f"doc-{uuid.uuid4().hex[:8]}"


class LoginRequest(BaseModel):
    identifier: str = Field(..., description="ABHA ID (patient) or Doctor ID (doctor)")
    role: str = Field(..., description="'patient' | 'doctor'")
    # Optional legacy field — ignored by ID-based auth (kept so old clients do not crash)
    password: Optional[str] = None


class AuthResponse(BaseModel):
    authenticated: bool
    message: str
    user: dict
    doctor_id: Optional[str] = None
    abha_id: Optional[str] = None
    session_token: Optional[str] = None


class DoctorRegisterJSON(BaseModel):
    full_name: str
    email: str
    phone: str
    specialization: str
    city: str
    registration_number: str
    verification_notes: Optional[str] = None


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, db=Depends(get_db)):
    """
    ID-based login:
    - Patient: identifier = ABHA ID
    - Doctor: identifier = Doctor ID (users.id where role=doctor)
    """
    role = (req.role or "").strip().lower()
    ident = (req.identifier or "").strip()

    if role not in ("patient", "doctor"):
        _error(400, "INVALID_ROLE", "Role must be 'patient' or 'doctor'")

    if not ident:
        if role == "patient":
            _error(400, "INVALID_ABHA", "Invalid ABHA ID")
        _error(400, "INVALID_DOCTOR_ID", "Invalid Doctor ID")

    if role == "patient":
        abha = _normalize_abha(ident)
        if not ABHA_PATTERN.match(abha) and not re.match(r"^\d{10,17}$", re.sub(r"\D", "", ident)):
            # Allow seeded demo ABHA formats; reject empty/obvious junk
            if len(abha) < 8:
                _error(400, "INVALID_ABHA", "Invalid ABHA ID")

        cursor = await db.execute(
            "SELECT * FROM users WHERE role = 'patient' AND abha_id = ?",
            (abha,),
        )
        user = await cursor.fetchone()

        # Also try raw identifier if normalization differed
        if not user and abha != ident:
            cursor = await db.execute(
                "SELECT * FROM users WHERE role = 'patient' AND abha_id = ?",
                (ident,),
            )
            user = await cursor.fetchone()

        if not user:
            _error(404, "ABHA_NOT_REGISTERED", "ABHA Not Registered")

        public = _public_user(user)
        token = await create_session(
            db,
            user_id=public["id"],
            role="patient",
            abha_id=public.get("abha_id"),
        )
        await db.execute(
            "INSERT INTO audit_log (encounter_id, actor, action, details) VALUES (NULL, ?, ?, ?)",
            (f"patient:{public.get('abha_id')}", "patient_login", json.dumps({"abha_id": public.get("abha_id")})),
        )
        await db.commit()

        return AuthResponse(
            authenticated=True,
            message="Patient authenticated successfully",
            user=public,
            abha_id=public.get("abha_id"),
            session_token=token,
        )

    # Doctor ID login
    doctor_id = ident
    cursor = await db.execute(
        "SELECT * FROM users WHERE role = 'doctor' AND id = ?",
        (doctor_id,),
    )
    user = await cursor.fetchone()
    if not user:
        _error(404, "DOCTOR_NOT_REGISTERED", "Doctor ID Not Registered")

    public = _public_user(user)
    token = await create_session(db, user_id=public["id"], role="doctor", abha_id=None)
    await db.execute(
        "INSERT INTO audit_log (encounter_id, actor, action, details) VALUES (NULL, ?, ?, ?)",
        (f"doctor:{public.get('id')}", "doctor_login", json.dumps({"doctor_id": public.get("id")})),
    )
    await db.commit()

    return AuthResponse(
        authenticated=True,
        message="Doctor authenticated successfully",
        user=public,
        doctor_id=public.get("id"),
        session_token=token,
    )


@router.post("/logout")
async def logout(authorization: Optional[str] = Header(default=None), db=Depends(get_db)):
    token = _extract_bearer(authorization)
    await revoke_session(db, token)
    return {"ok": True, "message": "Logged out"}


@router.post("/patient/register", response_model=AuthResponse)
async def register_patient(
    full_name: str = Form(...),
    date_of_birth: str = Form(...),
    age: int = Form(...),
    gender: str = Form(...),
    email: str = Form(""),
    phone: str = Form(...),
    city: str = Form(...),
    emergency_contact: str = Form(...),
    blood_group: str = Form(""),
    allergy_food: str = Form(""),
    allergy_drug: str = Form(""),
    allergy_environmental: str = Form(""),
    current_medications: str = Form(""),
    pre_existing_conditions: str = Form(""),
    chronic_diseases: str = Form(""),
    surgical_history: str = Form(""),
    medical_history: str = Form(""),
    abha_id: Optional[str] = Form(None),
    documents: Optional[List[UploadFile]] = File(None),
    document_types: Optional[List[str]] = Form(None),
    db=Depends(get_db),
):
    """
    Register a new patient with structured demographics + medical history.
    Optional prior medical documents are stored on disk and linked by ABHA/patient id.
    Returns account info but does NOT create a session — client must login with ABHA.
    """
    name = full_name.strip()
    mobile = phone.strip()
    if not name or not mobile:
        _error(400, "VALIDATION_ERROR", "Full name and phone number are required")

    requested_abha = _normalize_abha(abha_id) if abha_id else None
    if requested_abha:
        if not ABHA_PATTERN.match(requested_abha) and len(re.sub(r"\D", "", requested_abha)) < 10:
            _error(400, "INVALID_ABHA", "Invalid ABHA ID")
        cursor = await db.execute("SELECT id FROM users WHERE abha_id = ?", (requested_abha,))
        if await cursor.fetchone():
            _error(400, "ABHA_EXISTS", "This ABHA ID is already registered")
        final_abha = requested_abha
    else:
        # Generate unique ABHA
        final_abha = _generate_abha()
        for _ in range(5):
            cursor = await db.execute("SELECT id FROM users WHERE abha_id = ?", (final_abha,))
            if not await cursor.fetchone():
                break
            final_abha = _generate_abha()

    patient_id = f"pat-{uuid.uuid4().hex[:8]}"

    try:
        await db.execute(
            """
            INSERT INTO users (
                id, role, full_name, email, mobile, abha_id, password_hash,
                date_of_birth, age, gender, city, emergency_contact, blood_group,
                allergy_food, allergy_drug, allergy_environmental,
                current_medications, pre_existing_conditions, chronic_diseases,
                surgical_history, medical_history
            ) VALUES (?, 'patient', ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                patient_id, name, email.strip() or None, mobile, final_abha,
                date_of_birth.strip(), age, gender.strip(), city.strip(),
                emergency_contact.strip(), blood_group.strip() or None,
                allergy_food.strip() or None, allergy_drug.strip() or None,
                allergy_environmental.strip() or None,
                current_medications.strip() or None,
                pre_existing_conditions.strip() or None,
                chronic_diseases.strip() or None,
                surgical_history.strip() or None,
                medical_history.strip() or None,
            ),
        )

        # Mirror into patients master table for EMR linkage
        await db.execute(
            """
            INSERT OR IGNORE INTO patients (id, name, age, gender, phone, abha_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (patient_id, name, age, gender.strip(), mobile, final_abha),
        )

        # Registration encounter stub for document linkage (longitudinal container)
        reg_encounter_id = f"enc-reg-{uuid.uuid4().hex[:8]}"
        await db.execute(
            """
            INSERT INTO encounters (id, patient_id, abha_id, token_number, channel, status, department)
            VALUES (?, ?, ?, ?, 'registration', 'COMPLETED', 'Registration')
            """,
            (reg_encounter_id, patient_id, final_abha, f"R-{uuid.uuid4().hex[:4].upper()}"),
        )

        saved_docs = []
        files = documents or []
        types = document_types or []
        if files:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            for idx, upload in enumerate(files):
                if not upload or not upload.filename:
                    continue
                doc_id = f"doc-{uuid.uuid4().hex[:8]}"
                ext = Path(upload.filename).suffix or ".bin"
                dest = UPLOAD_DIR / f"{doc_id}{ext}"
                content = await upload.read()
                with open(dest, "wb") as f:
                    f.write(content)

                doc_type = types[idx] if idx < len(types) else "other"
                file_url = f"/static/uploads/{doc_id}{ext}"

                ocr_status = "STORED"
                ocr_text = ""
                ocr_lines = "[]"
                # Skip RapidOCR during registration — file is stored in the ABHA locker.
                # Native OCR engines can hard-crash the Windows uvicorn worker.

                await db.execute(
                    """
                    INSERT INTO documents (
                        id, encounter_id, patient_id, abha_id, file_path,
                        ocr_status, ocr_raw_text, ocr_lines, highlighted_path,
                        document_type, document_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    """,
                    (
                        doc_id, reg_encounter_id, patient_id, final_abha, file_url,
                        ocr_status, ocr_text, ocr_lines, file_url, doc_type,
                    ),
                )
                saved_docs.append({"document_id": doc_id, "document_type": doc_type, "file_path": file_url})

        await db.execute(
            "INSERT INTO audit_log (encounter_id, actor, action, details) VALUES (?, ?, ?, ?)",
            (
                reg_encounter_id,
                f"patient:{final_abha}",
                "patient_registered",
                json.dumps({"patient_id": patient_id, "abha_id": final_abha, "documents": len(saved_docs)}),
            ),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM users WHERE id = ?", (patient_id,))
        user = await cursor.fetchone()
        public = _public_user(user)
        public["documents_uploaded"] = saved_docs

        return AuthResponse(
            authenticated=False,
            message="Patient registered successfully. Please login with your ABHA ID.",
            user=public,
            abha_id=final_abha,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to register patient: {e}")
        _error(400, "REGISTRATION_FAILED", f"Registration failed: {str(e)}")


@router.post("/doctor/register", response_model=AuthResponse)
async def register_doctor(req: DoctorRegisterJSON, db=Depends(get_db)):
    """Register a doctor and generate a unique Doctor ID used for future login."""
    name = req.full_name.strip()
    email = req.email.strip()
    phone = req.phone.strip()
    specialization = req.specialization.strip()
    city = req.city.strip()
    reg_no = req.registration_number.strip()

    if not all([name, email, phone, specialization, city, reg_no]):
        _error(400, "VALIDATION_ERROR", "All doctor registration fields are required")

    # Uniqueness checks
    cursor = await db.execute(
        "SELECT id FROM users WHERE role = 'doctor' AND (email = ? OR registration_number = ?)",
        (email, reg_no),
    )
    if await cursor.fetchone():
        _error(400, "DOCTOR_EXISTS", "A doctor with this email or registration number already exists")

    doctor_id = _generate_doctor_id()
    for _ in range(5):
        cursor = await db.execute("SELECT id FROM users WHERE id = ?", (doctor_id,))
        if not await cursor.fetchone():
            break
        doctor_id = _generate_doctor_id()

    try:
        await db.execute(
            """
            INSERT INTO users (
                id, role, full_name, email, mobile, abha_id, password_hash,
                department, specialization, qualification, city,
                registration_number, verification_notes, room_number
            ) VALUES (?, 'doctor', ?, ?, ?, NULL, '', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doctor_id, name, email, phone,
                specialization, specialization, specialization, city,
                reg_no, (req.verification_notes or "").strip() or None,
                "Pending Assignment",
            ),
        )

        # Keep doctors staff table in sync for queue/room tooling
        await db.execute(
            """
            INSERT OR IGNORE INTO doctors (id, name, pin, department, specialty, room_number, is_available)
            VALUES (?, ?, '', ?, ?, 'Pending Assignment', 1)
            """,
            (doctor_id, name, specialization, specialization),
        )

        await db.execute(
            "INSERT INTO audit_log (encounter_id, actor, action, details) VALUES (NULL, ?, ?, ?)",
            (
                f"doctor:{doctor_id}",
                "doctor_registered",
                json.dumps({"doctor_id": doctor_id, "registration_number": reg_no}),
            ),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM users WHERE id = ?", (doctor_id,))
        user = await cursor.fetchone()
        public = _public_user(user)

        return AuthResponse(
            authenticated=False,
            message="Doctor registered successfully. Please login with your Doctor ID.",
            user=public,
            doctor_id=doctor_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to register doctor: {e}")
        _error(400, "REGISTRATION_FAILED", f"Registration failed: {str(e)}")


@router.get("/directory")
async def get_hospital_directory(db=Depends(get_db)):
    """Returns list of hospital OPD doctors, room numbers, and contact numbers."""
    cursor = await db.execute("""
        SELECT id, full_name, department, specialization, room_number, qualification,
               hospital_name, hospital_phone, city, registration_number
        FROM users
        WHERE role = 'doctor'
        ORDER BY room_number ASC
    """)
    doctors = [dict(row) for row in await cursor.fetchall()]

    return {
        "hospital_name": "All India Institute of Ayurveda (AIIA), New Delhi",
        "hospital_address": "Mathura Road, Gautam Puri, Sarita Vihar, New Delhi - 110076",
        "emergency_phone": "108 / 102",
        "opd_reception_phone": "+91-11-26950401",
        "doctors": doctors
    }
