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
