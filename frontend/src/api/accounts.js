import { readJson, request } from './client';

export function changePassword(password, passwordConfirm) {
  return request('/change-password/', {
    method: 'POST',
    body: { password, password_confirm: passwordConfirm },
  }).then(readJson);
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

export function registerDriver(data) {
  return request('/accounts/driver/', { method: 'POST', body: data }).then(readJson);
}

export function registerSponsor(data) {
  return request('/accounts/sponsor/', { method: 'POST', body: data }).then(readJson);
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

export function mfaBackupCodesRegenerate(password) {
  return request('/mfa/backup-codes/regenerate/', {
    method: 'POST',
    body: { password },
  }).then(readJson);
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
