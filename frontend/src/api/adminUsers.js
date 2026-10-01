import { readJson, request } from './client';

export function getAdminUsers({ search = '', role = '' } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (role && role !== 'all') params.set('role', role);
  const query = params.toString();
  return request(`/admin/users/${query ? `?${query}` : ''}`).then(readJson);
}

export function getAdminSponsorOrganizations() {
  return request('/admin/sponsor-organizations/').then(readJson);
}

export function createAdminUser(data) {
  return request('/admin/users/', { method: 'POST', body: data }).then(readJson);
}

export function getAdminAccount(userId) {
  return request(`/admin/admins/${userId}/`).then(readJson);
}

export function updateAdminAccount(userId, data) {
  return request(`/admin/admins/${userId}/`, { method: 'PATCH', body: data }).then(readJson);
}

export function getAdminSponsor(userId) {
  return request(`/admin/sponsors/${userId}/`).then(readJson);
}

export function updateAdminSponsor(userId, data) {
  return request(`/admin/sponsors/${userId}/`, { method: 'PATCH', body: data }).then(readJson);
}

export function getAdminDriver(userId) {
  return request(`/admin/drivers/${userId}/`).then(readJson);
}

export function updateAdminDriver(userId, data) {
  return request(`/admin/drivers/${userId}/`, { method: 'PATCH', body: data }).then(readJson);
}

export function startAdminImpersonation(userId) {
  return request(`/admin/impersonation/${userId}/`, { method: 'POST' }).then(readJson);
}

export function stopAdminImpersonation() {
  return request('/admin/impersonation/stop/', { method: 'POST' }).then(readJson);
}
