import { readJson, request } from './client';

export function listNotifications() {
  return request('/notifications/').then(readJson);
}

/** Mark the given alerts read, or every alert when no ids are passed. */
export function markNotificationsRead(ids) {
  return request('/notifications/read/', {
    method: 'POST',
    body: ids ? { ids } : {},
  }).then(readJson);
}

export function clearNotification(id) {
  return request(`/notifications/${id}/`, { method: 'DELETE' }).then(readJson);
}

export function clearAllNotifications() {
  return request('/notifications/clear/', { method: 'POST' }).then(readJson);
}

export function getSponsorNotificationPreferences() {
  return request('/notifications/sponsor-preferences/').then(readJson);
}

export function updateSponsorNotificationPreferences(data) {
  return request('/notifications/sponsor-preferences/', { method: 'PATCH', body: data }).then(
    readJson,
  );
}
