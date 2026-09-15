/**
 * MediKiosk — API Client
 * Fetch wrapper for all backend endpoints.
 */

const API_BASE = '';  // Vite proxies /api to FastAPI

async function request(url, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    try {
      const token = localStorage.getItem('medikiosk_session') || sessionStorage.getItem('medikiosk_session');
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch { /* ignore */ }
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err.detail;
      const message = typeof detail === 'object' ? (detail.message || JSON.stringify(detail)) : (detail || `HTTP ${res.status}`);
      throw new Error(message);
    }
    return res.json();
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      throw new Error('Cannot reach server. Is the backend running?');
    }
    throw err;
  }
}

export const api = {
  // ── Health ──
  health: () => request('/api/health'),

  // ── Encounters ──
  bootstrap: (language = 'hi', channel = 'kiosk', abhaId = null) =>
    request('/api/encounters/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ language, device_channel: channel, abha_id: abhaId }),
    }),

  getEncounter: (encounterId) =>
    request(`/api/encounters/${encounterId}`),

  // ── Call Sessions (Voice & Text Intake) ──
  startCall: (encounterId, language = 'hi') =>
    request('/api/call/session/start', {
      method: 'POST',
      body: JSON.stringify({ encounter_id: encounterId, language }),
    }),

  audioTurn: async (sessionId, audioBlob) => {
    const form = new FormData();
    form.append('session_id', sessionId);
    form.append('audio_file', audioBlob, 'recording.webm');
    const res = await fetch('/api/call/audio-turn', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  textTurn: async (sessionId, text) => {
    const form = new FormData();
    form.append('session_id', sessionId);
    form.append('text', text);
    const res = await fetch('/api/call/text-turn', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  endCall: (sessionId) =>
    request('/api/call/session/end', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }),

  // ── Documents (Prescription Scan) ──
  uploadDocument: async (encounterId, imageBlob) => {
    const form = new FormData();
    form.append('encounter_id', encounterId);
    form.append('document', imageBlob, 'prescription.jpg');
    const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // ── Queue ──
  queueStatus: (token) => request(`/api/queue/status/${token}`),

  // ── Doctor Dashboard ──
  doctorAuth: async (pinOrDoctorId) => {
    const body = typeof pinOrDoctorId === 'string' && pinOrDoctorId.startsWith('doc-')
      ? { doctor_id: pinOrDoctorId }
      : { pin: pinOrDoctorId };
    const data = await request('/api/doctor/auth', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    try {
      if (data?.session_token) {
        sessionStorage.setItem('medikiosk_session', data.session_token);
        if (data.doctor) sessionStorage.setItem('medikiosk_doctor', JSON.stringify(data.doctor));
      }
    } catch { /* ignore */ }
    return data;
  },

  doctorQueue: () => request('/api/doctor/queue'),

  patientDetail: (encounterId) =>
    request(`/api/doctor/patient/${encounterId}`),

  callNext: (encounterId) =>
    request(`/api/doctor/patient/${encounterId}/call-next`, { method: 'POST' }),

  // ── Unified Auth & Directory ──
  login: (role, identifier, _password = null) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, identifier }),
    }),

  registerPatient: async (patientData) => {
    const form = new FormData();
    Object.entries(patientData || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      form.append(key, value);
    });
    const res = await fetch('/api/auth/patient/register', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail;
      const message = typeof detail === 'object' ? (detail.message || JSON.stringify(detail)) : (detail || res.statusText);
      throw new Error(message);
    }
    return data;
  },

  registerDoctor: (doctorData) =>
    request('/api/auth/doctor/register', {
      method: 'POST',
      body: JSON.stringify(doctorData),
    }),

  getHospitalDirectory: () => request('/api/auth/directory'),

  // ── Patient Portal ──
  getPatientDashboard: (identifier) =>
    request(`/api/patient/dashboard/${encodeURIComponent(identifier)}`),

  uploadPatientDocument: async (patientId, file, documentType = 'prescription', documentDate = null) => {
    const form = new FormData();
    form.append('patient_id', patientId);
    form.append('document', file);
    form.append('document_type', documentType);
    if (documentDate) form.append('document_date', documentDate);

    const res = await fetch('/api/patient/document/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // ── Doctor Longitudinal & Verification ──
  getPatientByAbha: (abhaId, _doctorId = null) =>
    request(`/api/doctor/patient/by-abha/${encodeURIComponent(abhaId)}`),

  // Doctor identity comes from the server session; notes travel as a query param
  verifyEncounter: (encounterId, notes = 'Clinical history verified.') =>
    request(
      `/api/doctor/encounter/${encodeURIComponent(encounterId)}/verify?notes=${encodeURIComponent(notes)}`,
      { method: 'POST' }
    ),

  // ── AYUSH Dashavidha Pariksha ──
  saveAyushAssessment: (encounterId, record) =>
    request(`/api/ayush/encounter/${encounterId}/assessment`, {
      method: 'POST',
      body: JSON.stringify(record),
    }),

  getAyushAssessment: (encounterId) =>
    request(`/api/ayush/encounter/${encounterId}/assessment`),

  calculateAyush: (payload) =>
    request('/api/ayush/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ── Multi-Document Batch & Timeline ──
  batchUploadDocuments: async (encounterId, files, documentType = 'prescription', documentDate = null) => {
    const form = new FormData();
    form.append('encounter_id', encounterId);
    form.append('document_type', documentType);
    if (documentDate) form.append('document_date', documentDate);
    for (const f of files) {
      form.append('files', f);
    }
    const res = await fetch('/api/documents/batch-upload', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },

  getDocumentTimeline: (encounterId) =>
    request(`/api/documents/encounter/${encounterId}/timeline`),
};
