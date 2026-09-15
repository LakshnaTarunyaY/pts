import { api } from './client.js';
import { store } from '../store.js';

export const doctorApi = {
  // Prefer Doctor ID auth; pin retained for legacy callers — both return session_token
  auth: async (doctorIdOrPin, maybePin) => {
    let body;
    if (maybePin !== undefined) {
      body = { doctor_id: doctorIdOrPin, pin: maybePin };
    } else if (typeof doctorIdOrPin === 'string' && doctorIdOrPin.startsWith('doc-')) {
      body = { doctor_id: doctorIdOrPin };
    } else {
      body = { pin: doctorIdOrPin };
    }
    const res = await api.post('/api/doctor/auth', body);
    if (res?.session_token) {
      store.setSessionToken(res.session_token, { persist: false });
    }
    if (res?.doctor) {
      store.setDoctorAuthenticated(true, res.doctor, res.session_token);
    }
    return res;
  },

  getQueue: () => api.get('/api/doctor/queue'),

  // Logged-in doctor's own profile + live workstation stats
  me: async () => {
    const res = await api.get('/api/doctor/me');
    if (res?.doctor) store.setDoctorProfile(res.doctor);
    return res;
  },

  getPatientDetail: (encounterId) =>
    api.get(`/api/doctor/patient/${encounterId}`),

  getPatientByAbha: (abhaId) =>
    api.get(`/api/doctor/patient/by-abha/${encodeURIComponent(abhaId)}`),

  callNextPatient: (encounterId) =>
    api.post(`/api/doctor/patient/${encodeURIComponent(encounterId)}/call-next`, {}),

  // doctor_id is derived from the session server-side; notes are the only payload
  verifyEncounter: (encounterId, notes = 'Clinical history verified.') =>
    api.post(
      `/api/doctor/encounter/${encodeURIComponent(encounterId)}/verify?notes=${encodeURIComponent(notes)}`,
      {}
    ),
};
