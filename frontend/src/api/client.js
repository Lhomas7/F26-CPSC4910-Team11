const DEFAULT_API_URL = 'http://localhost:8000/api';

export const API_URL = (
  process.env.REACT_APP_API_URL || DEFAULT_API_URL
).replace(/\/+$/, '');

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function csrfToken() {
  return readCookie('csrftoken') || '';
}

function extractError(data) {
  if (!data) return 'Something went wrong.';
  if (typeof data.detail === 'string') return data.detail;
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (Array.isArray(value) && value.length) return String(value[0]);
    if (typeof value === 'string') return value;
  }
  return 'Something went wrong.';
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function request(path, { method = 'GET', body, headers } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const init = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body != null && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  };
  if (method !== 'GET') {
    init.headers['X-CSRFToken'] = csrfToken();
  }
  if (body != null) {
    // The browser supplies the multipart boundary for FormData requests.
    init.body = isFormData ? body : JSON.stringify(body);
  }
  return fetch(`${API_URL}${path}`, init);
}

export async function readJson(response) {
  if (response.status === 204) {
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(extractError(data), response.status, data);
  }
  return data;
}

/**
 * True when a request failed because the server is unreachable or broken,
 * rather than because the user did something wrong: fetch() rejects with a
 * TypeError ("Failed to fetch") when the server can't be reached, and a 5xx
 * means the server or its database is down.
 */
export function isOutageError(error) {
  return error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
}

/** Resolves true when the backend and its database are up. Never throws. */
export async function checkHealth() {
  try {
    const response = await request('/health/');
    return response.ok;
  } catch {
    return false;
  }
}
