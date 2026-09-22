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

async function request(path, { method = 'GET', body, headers } = {}) {
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

async function readJson(response) {
  if (response.status === 204) {
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(extractError(data), response.status, data);
  }
  return data;
}

export function ensureCsrf() {
  return request('/csrf/');
}

export function login(username, password) {
  return request('/login/', { method: 'POST', body: { username, password } }).then(readJson);
}

export function changePassword(password) {
  return request('/change-password/', {method: 'POST', body: { password }, }).then(readJson);
}

export function getProfile() {
  return request('/profile/').then(readJson);
}

export function updateProfile(data) {
  const includesPictureChange = data.profile_picture || data.remove_profile_picture;
  if (includesPictureChange) {
    const body = new FormData();
    body.append('name', data.name);
    body.append('username', data.username);
    if (data.profile_picture) body.append('profile_picture', data.profile_picture);
    if (data.remove_profile_picture) body.append('remove_profile_picture', 'true');
    return request('/profile/', { method: 'PATCH', body }).then(readJson);
  }
  return request('/profile/', { method: 'PATCH', body: data }).then(readJson);
}

export function logout() {
  return request('/logout/', { method: 'POST' }).then(readJson);
}

export function me() {
  return request('/me/').then(readJson);
}

export function registerDriver(data) {
  return request('/accounts/driver/', { method: 'POST', body: data }).then(readJson);
}

export function registerSponsor(data) {
  return request('/accounts/sponsor/', { method: 'POST', body: data }).then(readJson);
}

export function getDrivers() {
  return request('/sponsor/drivers/').then(readJson);
}

export function getDriver(driverId) {
  return request(`/sponsor/drivers/${driverId}/`).then(readJson);
}

export function updateDriver(driverId, data) {
  return request(`/sponsor/drivers/${driverId}/`, { method: 'PATCH', body: data }).then(readJson);
}

export function linkDriver(username) {
  return request('/sponsor/drivers/link/', { method: 'POST', body: { username } }).then(readJson);
}

export function mfaStatus() {
  return request('/mfa/status/').then(readJson);
}

export function mfaSetup(method, phoneNumber) {
  return request('/mfa/setup/', {
    method: 'POST',
    body: { method, phone_number: phoneNumber },
  }).then(readJson);
}

export function mfaVerify(method, code) {
  return request('/mfa/verify/', { method: 'POST', body: { method, code } }).then(readJson);
}

export function mfaRequestCode(purpose, method) {
  return request('/mfa/request-code/', { method: 'POST', body: { purpose, method } }).then(readJson);
}

export function mfaReset(fallbackMethod, fallbackCode) {
  return request('/mfa/reset/', {
    method: 'POST',
    body: { fallback_method: fallbackMethod, fallback_code: fallbackCode },
  }).then(readJson);
}

export function mfaDisable(method, password) {
  return request('/mfa/disable/', { method: 'POST', body: { method, password } }).then(readJson);
}

export function loginMfa(method, code) {
  return request('/login/mfa/', { method: 'POST', body: { method, code } }).then(readJson);
}

export function loginMfaRequestCode(method) {
  return request('/login/mfa/request-code/', { method: 'POST', body: { method } }).then(readJson);
}

export function sponsorMfaSettings(driverMfaRequired) {
  return request('/sponsor/mfa/settings/', {
    method: 'POST',
    body: { driver_mfa_required: driverMfaRequired },
  }).then(readJson);
}

export function getSponsorMfaSetting() {
  return request('/sponsor/mfa/settings/').then(readJson);
}
