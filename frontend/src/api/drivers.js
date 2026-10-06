import { readJson, request } from './client';

export function getDrivers() {
  return request('/sponsor/drivers/').then(readJson);
}

export function getDriver(driverId) {
  return request(`/sponsor/drivers/${driverId}/`).then(readJson);
}

export function approveDriver(driverId) {
  return request(`/sponsor/drivers/${driverId}/approve/`, { method: 'POST' }).then(readJson);
}

export function linkDriver(username) {
  return request('/sponsor/drivers/link/', { method: 'POST', body: { username } }).then(readJson);
}

export function adjustDriverPoints(driverId, pointChange, reason) {
  return request(`/sponsor/drivers/${driverId}/points/`, {
    method: 'POST',
    body: { point_change: pointChange, reason },
  }).then(readJson);
}

/** Point history, newest first: a driver's own, or a sponsor's organization's (optionally one driver). */
export function getPointHistory({ driver, limit } = {}) {
  const params = new URLSearchParams();
  if (driver) params.set('driver', driver);
  if (limit) params.set('limit', limit);
  const query = params.toString();
  return request(`/points/${query ? `?${query}` : ''}`).then(readJson);
}

/** Reject a pending driver or drop an approved one; the server records the reason. */
export function removeDriver(driverId, reason) {
  return request(`/sponsor/drivers/${driverId}/remove/`, { method: 'POST', body: { reason } }).then(readJson);
}
