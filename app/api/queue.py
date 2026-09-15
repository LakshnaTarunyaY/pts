"""
MediKiosk — Queue Status API
GET /api/queue/status/{token} — Live OPD queue tracker.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from app.database import get_db
from app.schemas.queue import QueueStatusResponse

logger = logging.getLogger("medikiosk.api.queue")
router = APIRouter(prefix="/api/queue", tags=["Queue"])


@router.get("/status/{token}", response_model=QueueStatusResponse)
async def get_queue_status(token: str, db=Depends(get_db)):
    """
    Get live queue status for a patient token.

    Returns position in queue, estimated wait time, and assigned doctor room.
    """
    row = await db.execute(
        "SELECT * FROM queue_tokens WHERE token = ?", (token,)
    )
    queue_entry = await row.fetchone()

    if not queue_entry:
        raise HTTPException(status_code=404, detail=f"Token {token} not found in queue")

    # Count patients ahead in the same department. Only encounters that actually reached
    # the physician's queue count — abandoned intakes must not inflate the wait estimate.
    ahead_row = await db.execute(
        """
        SELECT COUNT(*) as cnt
        FROM queue_tokens qt
        JOIN encounters e ON e.id = qt.encounter_id
        WHERE qt.department = ? AND qt.status = 'WAITING'
          AND e.status IN ('COMPLETED', 'IN_PROGRESS')
          AND qt.position < ? AND qt.token != ?
        """,
        (queue_entry["department"], queue_entry["position"], token)
    )
    patients_ahead = (await ahead_row.fetchone())["cnt"]

    # Estimate wait (rough: ~3 minutes per patient in typical Indian OPD)
    estimated_wait = patients_ahead * 3

    # Resolve the consulting physician from the assigned room, else the department roster
    doc_row = await db.execute(
        """
        SELECT full_name, room_number FROM users
        WHERE role = 'doctor' AND (
            (? IS NOT NULL AND room_number = ?) OR department = ?
        )
        ORDER BY CASE WHEN room_number = ? THEN 0 ELSE 1 END
        LIMIT 1
        """,
        (
            queue_entry["doctor_room"],
            queue_entry["doctor_room"],
            queue_entry["department"],
            queue_entry["doctor_room"],
        ),
    )
    doctor = await doc_row.fetchone()

    return QueueStatusResponse(
        token=token,
        department=queue_entry["department"],
        status=queue_entry["status"],
        patients_ahead=patients_ahead,
        estimated_wait_minutes=estimated_wait,
        doctor_room=queue_entry["doctor_room"] or (doctor["room_number"] if doctor else None),
        doctor_name=doctor["full_name"] if doctor else None
    )


@router.get("/all")
async def get_all_queue(db=Depends(get_db)):
    """Get all tokens in the queue (for doctor dashboard overview)."""
    rows = await db.execute(
        """
        SELECT qt.*, e.severity_badge, e.language, e.channel
        FROM queue_tokens qt
        JOIN encounters e ON qt.encounter_id = e.id
        ORDER BY
            CASE e.severity_badge
                WHEN 'RED' THEN 0
                WHEN 'YELLOW' THEN 1
                ELSE 2
            END,
            qt.position ASC
        """
    )
    entries = await rows.fetchall()

    return {
        "queue": [
            {
                "token": entry["token"],
                "encounter_id": entry["encounter_id"],
                "department": entry["department"],
                "status": entry["status"],
                "position": entry["position"],
                "severity_badge": entry["severity_badge"],
                "channel": entry["channel"],
                "doctor_room": entry["doctor_room"]
            }
            for entry in entries
        ],
        "total": len(entries)
    }
