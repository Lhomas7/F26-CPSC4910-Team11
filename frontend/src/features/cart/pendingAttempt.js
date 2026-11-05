const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storageKey = (owner) => `gdip.checkout.pending.${owner}`;

export function loadAttempt(owner) {
  if (owner == null) return null;
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey(owner)));
    return stored && UUID.test(stored.key) && Number.isFinite(Date.parse(stored.startedAt))
      ? { key: stored.key, startedAt: stored.startedAt, organization: typeof stored.organization === 'string' ? stored.organization : '' }
      : null;
  } catch {
    return null;
  }
}

export function saveAttempt(owner, attempt) {
  if (owner == null) return;
  // Never persist the review token or server error details.
  const record = { key: attempt.key, startedAt: attempt.startedAt, organization: attempt.organization };
  sessionStorage.setItem(storageKey(owner), JSON.stringify(record));
}

export function removeAttempt(owner) {
  if (owner == null) return;
  try { sessionStorage.removeItem(storageKey(owner)); } catch { /* Keep resolved UI usable. */ }
}

export function newAttemptKey() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
