/**
 * MediKiosk Web — Base API HTTP Client
 * Connects to FastAPI Backend (/api/*) with typed error handling & multipart support.
 * Attaches Bearer session token when present (patient/doctor portals).
 */

const BASE_URL = ''; // Relative path leverages Vite dev server proxy to http://localhost:8000

export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function getSessionToken() {
  try {
    return localStorage.getItem('medikiosk_session') || sessionStorage.getItem('medikiosk_session') || null;
  } catch {
    return null;
  }
}

export async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const headers = {
    ...options.headers,
  };

  const token = getSessionToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Auto-set JSON content-type if body is an object and not FormData
  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage = typeof data === 'object' && data.detail
        ? (typeof data.detail === 'string' ? data.detail : (data.detail.message || JSON.stringify(data.detail)))
        : `Request failed with status ${response.status}`;
      throw new ApiError(response.status, errorMessage, data);
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    console.warn(`[Network Error] Request to ${url} failed:`, err);
    throw new ApiError(0, 'Unable to connect to MediKiosk backend server. Please verify the edge service is running.');
  }
}

export const api = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),

  upload: (endpoint, formData, options = {}) => request(endpoint, {
    ...options,
    method: 'POST',
    body: formData,
  }),
};
