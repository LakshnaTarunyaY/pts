import { api, ApiError } from './client.js';

function extractAuthError(err) {
  const details = err?.details?.detail;
  if (details && typeof details === 'object') {
    return {
      code: details.code || 'AUTH_ERROR',
      message: details.message || err.message,
    };
  }
  return {
    code: 'AUTH_ERROR',
    message: err?.message || 'Authentication failed',
  };
}

export const authApi = {
  getHealth: () => api.get('/api/health'),

  /** ID-based login: patient → ABHA ID, doctor → Doctor ID */
  login: async (identifier, role) => {
    try {
      return await api.post('/api/auth/login', { identifier, role });
    } catch (err) {
      const parsed = extractAuthError(err);
      const error = new ApiError(err.status || 401, parsed.message, err.details);
      error.code = parsed.code;
      throw error;
    }
  },

  logout: () => api.post('/api/auth/logout', {}),

  /** Multipart patient registration (structured profile + optional documents) */
  registerPatient: (formData) => api.upload('/api/auth/patient/register', formData),

  /** Doctor registration — returns generated Doctor ID */
  registerDoctor: async (doctorData) => {
    try {
      return await api.post('/api/auth/doctor/register', doctorData);
    } catch (err) {
      const parsed = extractAuthError(err);
      const error = new ApiError(err.status || 400, parsed.message, err.details);
      error.code = parsed.code;
      throw error;
    }
  },

  getDirectory: () => api.get('/api/auth/directory'),
};
