"""
MediKiosk — Encounter Bootstrap API
POST /api/encounters/bootstrap — Initializes a new patient encounter.
Optional ABHA links the visit to an existing registered patient (longitudinal).
"""

import json
import re
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.database import get_db
from app.schemas.encounter import (
    EncounterBootstrapRequest,
    EncounterBootstrapResponse,
    EncounterLinkAbhaRequest,
    EncounterSummary,
    EncounterStatusUpdate,
    EncounterLanguageUpdate,
    SUPPORTED_LANGUAGES
)

logger = logging.getLogger("medikiosk.api.encounters")
router = APIRouter(prefix="/api/encounters", tags=["Encounters"])


def _normalize_abha(value: str) -> str:
    raw = (value or "").strip()
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 14:
        return f"{digits[:2]}-{digits[2:6]}-{digits[6:10]}-{digits[10:14]}"
    return raw


async def _generate_unique_token(db, requested_token: str | None = None) -> str:
    """Generate a guaranteed unique human-readable OPD token number."""
    import random
    if requested_token:
        cursor = await db.execute("SELECT 1 FROM encounters WHERE token_number = ?", (requested_token,))
        if not await cursor.fetchone():
            return requested_token
        # If collision on requested token, append a random 2-digit suffix
        suffix_token = f"{requested_token}-{random.randint(10, 99)}"
        return suffix_token

    for _ in range(50):
        prefix = random.choice(["A", "B", "C", "D", "K"])
        number = random.randint(100, 999)
        candidate = f"{prefix}-{number}"
        cursor = await db.execute("SELECT 1 FROM encounters WHERE token_number = ?", (candidate,))
        if not await cursor.fetchone():
            return candidate

    return f"T-{uuid.uuid4().hex[:6].upper()}"


async def _resolve_patient_by_abha(db, abha_raw: str | None):
    """Return (patient_id, abha_id, full_name, returning) for a registered ABHA."""
    if not abha_raw or not str(abha_raw).strip():
        return None, None, None, False

    abha = _normalize_abha(str(abha_raw))
    cursor = await db.execute(
        "SELECT id, abha_id, full_name FROM users WHERE role = 'patient' AND abha_id = ?",
        (abha,),
    )
    user = await cursor.fetchone()
    if not user and abha != abha_raw.strip():
        cursor = await db.execute(
            "SELECT id, abha_id, full_name FROM users WHERE role = 'patient' AND abha_id = ?",
            (abha_raw.strip(),),
        )
        user = await cursor.fetchone()

    if not user:
        raise HTTPException(
            status_code=404,
            detail={"code": "ABHA_NOT_REGISTERED", "message": "ABHA Not Registered"},
        )

    # Ensure patients master row exists for EMR continuity
    await db.execute(
        """
        INSERT OR IGNORE INTO patients (id, name, age, gender, phone, abha_id)
        SELECT id, full_name, age, gender, mobile, abha_id FROM users WHERE id = ?
        """,
        (user["id"],),
    )
    return user["id"], user["abha_id"], user["full_name"], True


@router.post("/bootstrap", response_model=EncounterBootstrapResponse)
async def bootstrap_encounter(request: EncounterBootstrapRequest, db=Depends(get_db)):
    """
    Initialize a new patient encounter.

    Creates an encounter record, assigns a queue token, and returns
    supported languages. This is the first API call from any intake channel.

    If abha_id is provided and registered, reuses that patient identity
    (new encounter, same patient — longitudinal continuity).
    Anonymous walk-in still works without ABHA.
    """
    encounter_id = f"enc-{uuid.uuid4().hex[:8]}"
    token = await _generate_unique_token(db, request.qr_token)

    patient_id = f"pat-{uuid.uuid4().hex[:8]}"
    abha_id = None
    patient_name = None
    returning = False

    if request.abha_id:
        patient_id, abha_id, patient_name, returning = await _resolve_patient_by_abha(db, request.abha_id)

    await db.execute(
        """
        INSERT INTO encounters (id, patient_id, abha_id, token_number, language, channel, status)
        VALUES (?, ?, ?, ?, ?, ?, 'BOOTSTRAPPED')
        """,
        (encounter_id, patient_id, abha_id, token, request.language, request.device_channel)
    )

    await db.execute(
        """
        INSERT INTO queue_tokens (token, encounter_id, department, status, position)
        VALUES (?, ?, 'General Medicine', 'WAITING', (SELECT COALESCE(MAX(position), 0) + 1 FROM queue_tokens))
        """,
        (token, encounter_id)
    )

    await db.execute(
        """
        INSERT INTO audit_log (encounter_id, actor, action, details)
        VALUES (?, 'system', 'encounter_bootstrapped', ?)
        """,
        (
            encounter_id,
            json.dumps({
                "channel": request.device_channel,
                "language": request.language,
                "abha_id": abha_id,
                "returning_patient": returning,
            }),
        ),
    )

    await db.commit()

    logger.info(
        f"Encounter bootstrapped: {encounter_id} (token={token}, channel={request.device_channel}, "
        f"abha={abha_id}, returning={returning})"
    )

    return EncounterBootstrapResponse(
        encounter_id=encounter_id,
        patient_id=patient_id,
        token_number=token,
        status="BOOTSTRAPPED",
        abha_id=abha_id,
        returning_patient=returning,
        patient_name=patient_name,
        supported_languages=SUPPORTED_LANGUAGES
    )


@router.post("/{encounter_id}/link-abha")
async def link_encounter_abha(encounter_id: str, request: EncounterLinkAbhaRequest, db=Depends(get_db)):
    """
    Attach a registered ABHA to an already-started walk-in encounter.
    Does not create a new patient profile — reuses the existing one.
    """
    cursor = await db.execute("SELECT * FROM encounters WHERE id = ?", (encounter_id,))
    enc = await cursor.fetchone()
    if not enc:
        raise HTTPException(status_code=404, detail="Encounter not found")

    patient_id, abha_id, patient_name, _ = await _resolve_patient_by_abha(db, request.abha_id)

    await db.execute(
        "UPDATE encounters SET patient_id = ?, abha_id = ?, updated_at = datetime('now') WHERE id = ?",
        (patient_id, abha_id, encounter_id),
    )
    await db.execute(
        """
        INSERT INTO audit_log (encounter_id, actor, action, details)
        VALUES (?, ?, 'encounter_abha_linked', ?)
        """,
        (
            encounter_id,
            f"patient:{abha_id}",
            json.dumps({"abha_id": abha_id, "patient_id": patient_id}),
        ),
    )
    await db.commit()

    return {
        "encounter_id": encounter_id,
        "patient_id": patient_id,
        "abha_id": abha_id,
        "patient_name": patient_name,
        "message": "Encounter linked to existing patient ABHA",
    }


@router.get("/{encounter_id}", response_model=EncounterSummary)
async def get_encounter(encounter_id: str, db=Depends(get_db)):
    """Get encounter details by ID."""
    row = await db.execute(
        "SELECT * FROM encounters WHERE id = ?", (encounter_id,)
    )
    encounter = await row.fetchone()

    if not encounter:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Encounter not found")

    # Count facts
    fact_count_row = await db.execute(
        "SELECT COUNT(*) as cnt FROM clinical_facts WHERE encounter_id = ?",
        (encounter_id,)
    )
    fact_count = (await fact_count_row.fetchone())["cnt"]

    return EncounterSummary(
        encounter_id=encounter["id"],
        token_number=encounter["token_number"],
        channel=encounter["channel"],
        language=encounter["language"],
        status=encounter["status"],
        severity_badge=encounter["severity_badge"],
        department=encounter["department"],
        created_at=encounter["created_at"],
        fact_count=fact_count,
        has_red_flags=encounter["severity_badge"] == "RED"
    )


@router.patch("/{encounter_id}/status")
async def update_encounter_status(
    encounter_id: str,
    update: EncounterStatusUpdate,
    db=Depends(get_db)
):
    """Update encounter status."""
    await db.execute(
        "UPDATE encounters SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (update.status, encounter_id)
    )
    await db.execute(
        "INSERT INTO audit_log (encounter_id, actor, action, details) VALUES (?, 'system', 'status_updated', ?)",
        (encounter_id, f'{{"new_status": "{update.status}"}}')
    )
    await db.commit()

    return {"encounter_id": encounter_id, "status": update.status}


@router.patch("/{encounter_id}/language")
async def update_encounter_language(
    encounter_id: str,
    update: EncounterLanguageUpdate,
    db=Depends(get_db)
):
    """Update encounter preferred language."""
    cursor = await db.execute("SELECT 1 FROM encounters WHERE id = ?", (encounter_id,))
    if not await cursor.fetchone():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Encounter not found")

    await db.execute(
        "UPDATE encounters SET language = ?, updated_at = datetime('now') WHERE id = ?",
        (update.language, encounter_id)
    )
    await db.execute(
        "INSERT INTO audit_log (encounter_id, actor, action, details) VALUES (?, 'system', 'language_updated', ?)",
        (encounter_id, f'{{"new_language": "{update.language}"}}')
    )
    await db.commit()

    return {"encounter_id": encounter_id, "language": update.language}

