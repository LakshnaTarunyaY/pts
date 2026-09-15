import { api } from './client.js';

export const patientApi = {
  getDashboard: (identifier) =>
    api.get(`/api/patient/dashboard/${encodeURIComponent(identifier)}`),

  uploadDocument: (identifier, file, docType = 'prescription') => {
    const formData = new FormData();
    formData.append('identifier', identifier);
    formData.append('patient_id', identifier);
    formData.append('document', file);
    formData.append('document_type', docType);
    return api.upload('/api/patient/document/upload', formData);
  },
};
