import { API_ACTIVITY_EVENT, SESSION_EXPIRED_EVENT } from '../auth/sessionEvents';

const DEFAULT_API_URL = 'http://localhost:8000/api';

export const API_URL = (process.env.REACT_APP_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');

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

/** A request that never received an HTTP response from the API. */
export class NetworkError extends Error {
  constructor(message = 'The server could not be reached.', cause) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
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
  // Every request counts as activity for the server's idle timeout.
  window.dispatchEvent(new Event(API_ACTIVITY_EVENT));
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    // Browsers reject fetch() with a generic TypeError. Convert it here so a
    // TypeError raised later in application code is never mistaken for an outage.
    throw new NetworkError(undefined, error);
  }
  if (response.status === 401) {
    const data = await response
      .clone()
      .json()
      .catch(() => ({}));
    if (data.code === 'session_expired') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }
  return response;
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
 * NetworkError when no HTTP response was received, and a 5xx means the server
 * or its database is down.
 */
export function isOutageError(error) {
  return error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
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
