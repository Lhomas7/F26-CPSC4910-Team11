import { API_ACTIVITY_EVENT, SESSION_EXPIRED_EVENT } from '../auth/sessionEvents';
import { request } from './client';

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
