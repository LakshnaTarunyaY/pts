"""
MediKiosk — Server-side auth sessions + doctor ABHA access grants.
Keeps kiosk walk-in public; protects patient portal and longitudinal doctor lookups.
"""

from __future__ import annotations

import json
import secrets
import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException
from app.database import get_db

logger = logging.getLogger("medikiosk.security.session")

SESSION_TTL_HOURS = 12


async def create_session(db, *, user_id: str, role: str, abha_id: Optional[str] = None) -> str:
    """Create a server-side session and return the opaque token."""
    token = secrets.token_urlsafe(32)
    await db.execute(
        """
        INSERT INTO auth_sessions (token, user_id, role, abha_id, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', ?))
        """,
        (token, user_id, role, abha_id, f"+{SESSION_TTL_HOURS} hours"),
    )
    await db.commit()
    return token


async def revoke_session(db, token: str) -> None:
    if not token:
        return
    await db.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
    await db.commit()


async def get_session(db, token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    cursor = await db.execute(
        """
        SELECT * FROM auth_sessions
        WHERE token = ? AND datetime(expires_at) > datetime('now')
        """,
        (token,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip() or None


async def require_patient_session(
    authorization: Optional[str] = Header(default=None),
    db=Depends(get_db),
) -> dict:
    token = _extract_bearer(authorization)
    session = await get_session(db, token)
    if not session or session.get("role") != "patient":
        raise HTTPException(
            status_code=401,
            detail={"code": "PATIENT_AUTH_REQUIRED", "message": "Patient login required"},
        )
    return session


async def require_doctor_session(
    authorization: Optional[str] = Header(default=None),
    db=Depends(get_db),
) -> dict:
    """Require a live doctor Bearer session. doctor_id query alone is never enough."""
    token = _extract_bearer(authorization)
    session = await get_session(db, token)
    if session and session.get("role") == "doctor":
        return session

    raise HTTPException(
        status_code=401,
        detail={"code": "DOCTOR_AUTH_REQUIRED", "message": "Doctor login required"},
    )


async def grant_doctor_abha_access(
    db,
    *,
    doctor_id: str,
    abha_id: str,
    reason: str = "clinical_care",
    granted_by: str = "system",
) -> None:
    if not doctor_id or not abha_id:
        return
    await db.execute(
        """
        INSERT OR IGNORE INTO doctor_abha_access (doctor_id, abha_id, reason, granted_by)
        VALUES (?, ?, ?, ?)
        """,
        (doctor_id, abha_id, reason, granted_by),
    )
    await db.commit()


async def doctor_can_access_abha(db, doctor_id: str, abha_id: str) -> tuple[bool, str]:
    """
    Authorization rules (EMR-style, per-doctor — not hospital-wide):
    1. Explicit grant in doctor_abha_access (seed / call-next / verify)
    2. This doctor previously verified an encounter for that ABHA

    Active OPD alone does NOT grant longitudinal lookup to every doctor;
    call-next / verify write an explicit grant for the acting physician.
    """
    if not doctor_id or not abha_id:
        return False, "missing_ids"

    cursor = await db.execute(
        "SELECT 1 FROM doctor_abha_access WHERE doctor_id = ? AND abha_id = ?",
        (doctor_id, abha_id),
    )
    if await cursor.fetchone():
        return True, "explicit_grant"

    cursor = await db.execute(
        """
        SELECT 1 FROM encounters
        WHERE abha_id = ? AND verified_by_doctor_id = ?
        LIMIT 1
        """,
        (abha_id, doctor_id),
    )
    if await cursor.fetchone():
        return True, "prior_verified_care"

    return False, "denied"


async def resolve_abha_for_encounter(db, encounter_id: str) -> Optional[str]:
    cursor = await db.execute(
        "SELECT abha_id, patient_id FROM encounters WHERE id = ?",
        (encounter_id,),
    )
    enc = await cursor.fetchone()
    if not enc:
        return None
    if enc["abha_id"]:
        return enc["abha_id"]
    # Resolve via registered user id
    if enc["patient_id"]:
        cursor = await db.execute(
            "SELECT abha_id FROM users WHERE id = ? AND role = 'patient'",
            (enc["patient_id"],),
        )
        user = await cursor.fetchone()
        if user and user["abha_id"]:
            return user["abha_id"]
    return None


async def audit(db, *, actor: str, action: str, details: dict, encounter_id: Optional[str] = None):
    await db.execute(
        "INSERT INTO audit_log (encounter_id, actor, action, details) VALUES (?, ?, ?, ?)",
        (encounter_id, actor, action, json.dumps(details)),
    )
    await db.commit()
