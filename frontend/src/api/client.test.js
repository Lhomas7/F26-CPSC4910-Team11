import { ApiError, checkHealth, isOutageError } from './client';

afterEach(() => {
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
