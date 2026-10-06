import { API_ACTIVITY_EVENT, SESSION_EXPIRED_EVENT } from '../auth/sessionEvents';
import { ApiError, checkHealth, isOutageError, request } from './client';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let activity;
let expired;

beforeEach(() => {
  activity = jest.fn();
  expired = jest.fn();
  window.addEventListener(API_ACTIVITY_EVENT, activity);
  window.addEventListener(SESSION_EXPIRED_EVENT, expired);
});

afterEach(() => {
  window.removeEventListener(API_ACTIVITY_EVENT, activity);
  window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  delete global.fetch;
});

test('isOutageError flags unreachable servers and 5xx responses only', () => {
  expect(isOutageError(new TypeError('Failed to fetch'))).toBe(true);
  expect(isOutageError(new ApiError('Server error', 503))).toBe(true);
  expect(isOutageError(new ApiError('Invalid username or password.', 400))).toBe(false);
  expect(isOutageError(new Error('Something else'))).toBe(false);
  expect(isOutageError(null)).toBe(false);
});

test('checkHealth reports the health endpoint status without throwing', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  await expect(checkHealth()).resolves.toBe(true);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/health\/$/), expect.any(Object));

  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  await expect(checkHealth()).resolves.toBe(false);

  global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(checkHealth()).resolves.toBe(false);
});

test('every request is reported as activity', async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, {}));
  await request('/me/');
  await request('/profile/');
  expect(activity).toHaveBeenCalledTimes(2);
  expect(expired).not.toHaveBeenCalled();
});

test('a session_expired 401 announces the expiry and still returns the response', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    jsonResponse(401, { detail: 'Your session expired.', code: 'session_expired' }),
  );
  const response = await request('/me/');
  expect(expired).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(401);
  expect((await response.json()).code).toBe('session_expired');
});

test('other 401s do not announce an expiry', async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, { detail: 'Nope.' }));
  await request('/me/');
  expect(expired).not.toHaveBeenCalled();
});
