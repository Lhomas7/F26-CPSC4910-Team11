import { readJson, request } from './client';

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
