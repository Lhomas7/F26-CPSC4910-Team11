import { readJson, request } from './client';

export function ensureCsrf() {
  return request('/csrf/');
}

export function login(username, password) {
  return request('/login/', { method: 'POST', body: { username, password } }).then(readJson);
}

export function logout() {
  return request('/logout/', { method: 'POST' }).then(readJson);
}

export function me() {
  return request('/me/').then(readJson);
}

export function requestPasswordReset(email) {
  return request('/password-reset/', { method: 'POST', body: { email } }).then(readJson);
}

export function confirmPasswordReset({ uid, token, password, passwordConfirm }) {
  return request('/password-reset/confirm/', {
    method: 'POST',
    body: { uid, token, password, password_confirm: passwordConfirm },
  }).then(readJson);
}

export function loginMfa(method, code) {
  return request('/login/mfa/', { method: 'POST', body: { method, code } }).then(readJson);
}

export function loginMfaRequestCode(method) {
  return request('/login/mfa/request-code/', { method: 'POST', body: { method } }).then(readJson);
}
