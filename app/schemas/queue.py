"""
MediKiosk — Queue Status Schemas
OPD waiting queue tracker for mobile app and doctor dashboard.
"""

from pydantic import BaseModel, Field
from typing import Optional


class QueueStatusResponse(BaseModel):
    """Live queue status for a patient token."""
    token: str
    department: str = "General Medicine"
    status: str = Field(description="WAITING | CALLED | IN_CONSULTATION | COMPLETED")
    patients_ahead: int = 0
    estimated_wait_minutes: int = 0
    doctor_room: Optional[str] = None
    doctor_name: Optional[str] = None
