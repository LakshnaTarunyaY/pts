"""
MediKiosk — Doctor Dashboard Schemas
PIN-gated doctor interface models for queue intelligence and evidence drilldown.
"""

from pydantic import BaseModel, Field
from typing import Optional
from app.schemas.clinical_fact import ClinicalFact, DrugInteractionAlert, LabResultAlert, ClinicalGapAlert
from app.schemas.encounter import EncounterSummary


class DoctorAuthRequest(BaseModel):
    """Doctor authentication — prefer doctor_id; pin kept for legacy clinical clients."""
    doctor_id: Optional[str] = Field(default=None, description="Application Doctor ID")
    pin: Optional[str] = Field(default=None, description="Legacy 4-digit PIN (optional)")


class DoctorAuthResponse(BaseModel):
    """Doctor authentication response."""
    authenticated: bool
    message: str
    doctor: Optional[dict] = None
    session_token: Optional[str] = None


class PatientQueueEntry(BaseModel):
    """Single patient entry in the doctor's waiting queue with triage info."""
    encounter_id: str
    token_number: str
    severity_badge: str = Field(description="GREEN | YELLOW | RED")
    summary_30_words: str = Field(description="Changes-first 30-word triage summary")
    channel: str
    fact_count: int = 0
    has_medication_conflict: bool = False
    has_red_flags: bool = False
    created_at: Optional[str] = None
    language: Optional[str] = Field(default="hi", description="Patient selected language: en, hi, ta, te, mr")
    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    department: Optional[str] = None


class DoctorQueueResponse(BaseModel):
    """Full waiting queue for the doctor dashboard."""
    queue: list[PatientQueueEntry] = Field(default_factory=list)
    total_waiting: int = 0


class PatientDetailView(BaseModel):
    """Complete patient detail view for the doctor — facts, alerts, evidence."""
    encounter: EncounterSummary
    clinical_facts: list[ClinicalFact] = Field(default_factory=list)
    drug_interaction_alerts: list[DrugInteractionAlert] = Field(default_factory=list)
    lab_result_alerts: list[LabResultAlert] = Field(default_factory=list)
    clinical_gap_alerts: list[ClinicalGapAlert] = Field(default_factory=list)
    ayush_intake: Optional[dict] = None
    medication_timeline: Optional[list[dict]] = None
    documents: list[dict] = Field(default_factory=list)
