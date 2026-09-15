"""
Integration tests for MediKiosk FastAPI REST Endpoints.
Verifies all public routes used by Web Kiosk, Mobile App (BYOD), and Doctor Dashboard.
"""

import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture(scope="module")
def client():
    """TestClient fixture with FastAPI lifespan management (triggers init_db)."""
    with TestClient(app) as c:
        yield c


def test_health_check(client):
    """Verify /api/health returns healthy status and endpoint inventory."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["sih_problem_id"] == "SIH26047"
    assert "llm_providers" in data
    assert "endpoints" in data


def test_encounter_bootstrap_and_queue(client):
    """Verify encounter creation and subsequent queue token tracking."""
    # 1. Bootstrap new encounter
    bootstrap_payload = {
        "device_id": "test-kiosk-unit-01",
        "intake_mode": "KIOSK",
        "preferred_language": "hi",
        "patient_name": "Ramesh Kumar",
        "patient_age": 52,
        "patient_gender": "male",
        "department": "Kayachikitsa"
    }
    res = client.post("/api/encounters/bootstrap", json=bootstrap_payload)
    assert res.status_code == 200
    b_data = res.json()
    assert "encounter_id" in b_data
    assert "token_number" in b_data
    encounter_id = b_data["encounter_id"]
    token_number = b_data["token_number"]

    # 2. Check queue status with the generated token
    q_res = client.get(f"/api/queue/status/{token_number}")
    assert q_res.status_code == 200
    q_data = q_res.json()
    assert q_data["token"] == token_number
    assert "patients_ahead" in q_data
    assert "status" in q_data


def test_call_session_start(client):
    """Verify voice call session start, opening prompt, and synthesized audio generation."""
    # 1. First bootstrap an encounter
    bootstrap_res = client.post("/api/encounters/bootstrap", json={
        "device_id": "mobile-app-client-01",
        "intake_mode": "MOBILE_APP",
        "preferred_language": "hi"
    })
    encounter_id = bootstrap_res.json()["encounter_id"]

    # 2. Start call session
    session_res = client.post("/api/call/session/start", json={
        "encounter_id": encounter_id,
        "language": "hi"
    })
    assert session_res.status_code == 200
    session_data = session_res.json()
    assert session_data["status"] == "CALL_ACTIVE"
    assert len(session_data["opening_text"]) > 0
    # Audio base64 must be populated (pyttsx3 or Sarvam or silence fallback)
    assert len(session_data["opening_audio_base64"]) > 0


def test_call_session_text_turn_and_end(client):
    """Verify touchscreen keyboard text turn and ending session."""
    # 1. Bootstrap encounter
    bootstrap_res = client.post("/api/encounters/bootstrap", json={
        "device_id": "kiosk-unit-02",
        "device_channel": "kiosk",
        "language": "hi"
    })
    assert bootstrap_res.status_code == 200
    encounter_id = bootstrap_res.json()["encounter_id"]

    # 2. Start call session
    session_res = client.post("/api/call/session/start", json={
        "encounter_id": encounter_id,
        "language": "hi"
    })
    assert session_res.status_code == 200
    session_id = session_res.json()["session_id"]

    # 3. Submit text turn (keyboard typing)
    turn_res = client.post("/api/call/text-turn", data={
        "session_id": session_id,
        "text": "मुझे 3 दिन से तेज सिरदर्द और बुखार है"
    })
    assert turn_res.status_code == 200
    turn_data = turn_res.json()
    assert turn_data["turn_index"] == 1
    assert "patient_transcript" in turn_data
    assert "extracted_facts" in turn_data

    # 4. End session
    end_res = client.post("/api/call/session/end", json={
        "session_id": session_id
    })
    assert end_res.status_code == 200
    end_data = end_res.json()
    assert end_data["status"] == "COMPLETED"
    assert "assigned_token" in end_data


def test_doctor_auth_and_queue(client):
    """Verify Doctor PIN authentication gate and doctor OPD queue view."""
    # Invalid PIN returns 401
    bad_auth = client.post("/api/doctor/auth", json={"pin": "wrong_pin"})
    assert bad_auth.status_code == 401

    # Valid PIN (1234 default) returns 200 with authenticated flag
    good_auth = client.post("/api/doctor/auth", json={"pin": "1234"})
    assert good_auth.status_code == 200
    auth_data = good_auth.json()
    assert auth_data["authenticated"] is True

    # Query doctor queue
    queue_res = client.get("/api/doctor/queue")
    assert queue_res.status_code == 200
    queue_data = queue_res.json()
    assert "queue" in queue_data
    assert "total_waiting" in queue_data
    assert isinstance(queue_data["queue"], list)


def test_document_upload_pipeline(client):
    """Verify document upload, image storage, and extraction pipeline."""
    # 1. Bootstrap encounter
    bootstrap_res = client.post("/api/encounters/bootstrap", json={
        "device_id": "scanner-kiosk-01",
        "intake_mode": "KIOSK"
    })
    encounter_id = bootstrap_res.json()["encounter_id"]

    # 2. Generate a minimal in-memory test prescription image
    img = Image.new("RGB", (400, 200), color=(255, 255, 255))
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format="JPEG")
    img_byte_arr.seek(0)

    # 3. Upload prescription
    upload_res = client.post(
        "/api/documents/upload",
        data={
            "encounter_id": encounter_id
        },
        files={
            "document": ("test_prescription.jpg", img_byte_arr.getvalue(), "image/jpeg")
        }
    )
    assert upload_res.status_code == 200
    up_data = upload_res.json()
    assert "document_id" in up_data
    assert "extracted_medications" in up_data
    assert "ocr_status" in up_data


def _doctor_headers(client, doctor_id="doc-verma"):
    res = client.post("/api/auth/login", json={"identifier": doctor_id, "role": "doctor"})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['session_token']}"}


def _patient_headers(client, abha_id="91-4821-3910-4819"):
    res = client.post("/api/auth/login", json={"identifier": abha_id, "role": "patient"})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['session_token']}"}


def test_auth_and_hospital_directory(client):
    """Verify ID-based login (no passwords) and hospital OPD directory."""
    # 1. Doctor logs in with Doctor ID only
    doc_login = client.post("/api/auth/login", json={
        "identifier": "doc-verma",
        "role": "doctor"
    })
    assert doc_login.status_code == 200
    d_data = doc_login.json()
    assert d_data["authenticated"] is True
    assert d_data["user"]["role"] == "doctor"
    assert d_data["session_token"]

    # 2. Patient logs in with ABHA ID only; mobile number is no longer a credential
    pat_login = client.post("/api/auth/login", json={
        "identifier": "91-4821-3910-4819",
        "role": "patient"
    })
    assert pat_login.status_code == 200
    p_data = pat_login.json()
    assert p_data["authenticated"] is True
    assert p_data["user"]["abha_id"] == "91-4821-3910-4819"
    assert p_data["session_token"]

    assert client.post("/api/auth/login", json={
        "identifier": "9876543210",
        "role": "patient"
    }).status_code == 404

    # 3. Hospital OPD directory
    dir_res = client.get("/api/auth/directory")
    assert dir_res.status_code == 200
    dir_data = dir_res.json()
    assert "doctors" in dir_data
    assert len(dir_data["doctors"]) >= 4
    assert dir_data["opd_reception_phone"] == "+91-11-26950401"


def test_doctor_me_reflects_logged_in_doctor(client):
    """Workstation header data must come from the session, never a hardcoded physician."""
    assert client.get("/api/doctor/me").status_code == 401

    me = client.get("/api/doctor/me", headers=_doctor_headers(client))
    assert me.status_code == 200
    body = me.json()
    assert body["doctor"]["id"] == "doc-verma"
    stats = body["stats"]
    assert {"waiting_patients", "critical_patients", "average_consult_minutes"} <= set(stats)
    assert stats["average_consult_minutes"] is None or stats["average_consult_minutes"] >= 0


def test_doctor_abha_lookup_and_verify(client):
    """Verify doctor can retrieve longitudinal patient records by ABHA and verify cases."""
    headers = _doctor_headers(client)

    # 1. Anonymous lookups are rejected; authorized doctors get the record
    assert client.get("/api/doctor/patient/by-abha/91-4821-3910-4819").status_code == 401

    abha_res = client.get("/api/doctor/patient/by-abha/91-4821-3910-4819", headers=headers)
    assert abha_res.status_code == 200
    abha_data = abha_res.json()
    assert abha_data["abha_id"] == "91-4821-3910-4819"
    assert "patient" in abha_data

    # 2. Bootstrap an encounter and verify it
    b_res = client.post("/api/encounters/bootstrap", json={
        "patient_name": "Ramesh Kumar",
        "preferred_language": "hi",
        "department": "General Medicine"
    })
    enc_id = b_res.json()["encounter_id"]

    # A spoofed doctor_id must be ignored in favour of the session identity
    verify_res = client.post(
        f"/api/doctor/encounter/{enc_id}/verify",
        params={
            "doctor_id": "doc-someone-else",
            "notes": "Verified fever & headache intake. Advised Sudarshana Ghanavati and rest."
        },
        headers=headers,
    )
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert v_data["status"] == "DOCTOR_REVIEWED"
    assert "Dr. S. Verma" in v_data["verified_by"]


def test_patient_dashboard_endpoint(client):
    """Verify patient portal dashboard with active token and clinical history."""
    assert client.get("/api/patient/dashboard/91-4821-3910-4819").status_code == 401

    headers = _patient_headers(client)
    dash_res = client.get("/api/patient/dashboard/91-4821-3910-4819", headers=headers)
    assert dash_res.status_code == 200
    dash = dash_res.json()
    assert "profile" in dash
    assert dash["profile"]["abha_id"] == "91-4821-3910-4819"
    assert "active_token" in dash
    assert "encounters" in dash

    # Unverified visits must not carry a fabricated physician or note
    for enc in dash["encounters"]:
        verification = enc["doctor_verification"]
        if not verification["is_verified"]:
            assert not verification["doctor_name"]
            assert not verification["doctor_notes"]

    # Another patient's record stays out of reach
    assert client.get(
        "/api/patient/dashboard/91-0000-0000-0000", headers=headers
    ).status_code in (403, 404)


def test_encounter_language_update_and_multilingual_call(client):
    """Verify encounter language update and multilingual call start across all 5 languages."""
    # 1. Bootstrap with default Hindi
    b_res = client.post("/api/encounters/bootstrap", json={"language": "hi"})
    assert b_res.status_code == 200
    enc_id = b_res.json()["encounter_id"]

    # 2. Update language to Tamil
    patch_res = client.patch(f"/api/encounters/{enc_id}/language", json={"language": "ta"})
    assert patch_res.status_code == 200
    assert patch_res.json()["language"] == "ta"

    # Verify encounter fetch reflects new language
    get_res = client.get(f"/api/encounters/{enc_id}")
    assert get_res.status_code == 200
    assert get_res.json()["language"] == "ta"

    # 3. Reject invalid language code
    invalid_patch = client.patch(f"/api/encounters/{enc_id}/language", json={"language": "french"})
    assert invalid_patch.status_code == 422

    # 4. Start call session with Tamil and verify native opening text
    call_res = client.post("/api/call/session/start", json={"encounter_id": enc_id, "language": "ta"})
    assert call_res.status_code == 200
    call_data = call_res.json()
    assert "வணக்கம்" in call_data["opening_text"]

    # 5. Start call session with Telugu and Marathi
    call_te = client.post("/api/call/session/start", json={"encounter_id": enc_id, "language": "te"})
    assert call_te.status_code == 200
    assert "నమస్కారం" in call_te.json()["opening_text"]

    call_mr = client.post("/api/call/session/start", json={"encounter_id": enc_id, "language": "mr"})
    assert call_mr.status_code == 200
    assert "नमस्कार" in call_mr.json()["opening_text"]


