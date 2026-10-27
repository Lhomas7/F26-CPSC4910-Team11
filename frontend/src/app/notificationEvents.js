/** Fired after an action that may have created alerts, so the bell refreshes right away. */
export const NOTIFICATIONS_CHANGED_EVENT = 'gd:notifications-changed';

export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
