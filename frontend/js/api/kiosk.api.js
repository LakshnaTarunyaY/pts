import { api } from './client.js';

export const kioskApi = {
  // Bootstrap new encounter & queue token
  bootstrap: (data = {}) => api.post('/api/encounters/bootstrap', {
    device_channel: data.device_channel || 'kiosk',
    language: data.language || 'hi',
    qr_token: data.qr_token || null,
    abha_id: data.abha_id || null,
  }),

  linkAbha: (encounterId, abhaId) =>
    api.post(`/api/encounters/${encodeURIComponent(encounterId)}/link-abha`, { abha_id: abhaId }),

  // Get encounter details
  getEncounter: (encounterId) => 
    api.get(`/api/encounters/${encounterId}`),

  // Update encounter status
  updateStatus: (encounterId, status) => 
    api.patch(`/api/encounters/${encounterId}/status`, { status }),

  // Start voice intake session
  startCallSession: (encounterId, language = 'hi') => 
    api.post('/api/call/session/start', { encounter_id: encounterId, language }),

  // Send audio turn (speech turn)
  sendAudioTurn: (sessionId, audioBlob, language = null) => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('audio_file', audioBlob, 'patient_voice.wav');
    if (language) {
      formData.append('language', language);
    }
    return api.upload('/api/call/audio-turn', formData);
  },

  // Fallback text turn (FastAPI expects Form data)
  sendTextTurn: (sessionId, text, language = null) => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('text', text);
    if (language) {
      formData.append('language', language);
    }
    return api.upload('/api/call/text-turn', formData);
  },

  // End voice session
  endCallSession: (sessionId) => 
    api.post('/api/call/session/end', { session_id: sessionId }),

  // Calculate AYUSH scores from kiosk responses
  calculateAyush: (payload) => api.post('/api/ayush/calculate', payload),

  // Save AYUSH Dashavidha Pariksha assessment
  saveAyushAssessment: (encounterId, assessmentRecord) => 
    api.post(`/api/ayush/encounter/${encounterId}/assessment`, assessmentRecord),
};
