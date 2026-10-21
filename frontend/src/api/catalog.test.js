import { ApiError, NetworkError } from './client';
import { getCatalog } from './catalog';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('uses the shared authenticated client without accepting browser-supplied ownership', async () => {
  const payload = { products: [] };
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload });

  await expect(getCatalog()).resolves.toEqual(payload);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/catalog\/$/),
    expect.objectContaining({ method: 'GET', credentials: 'include' }),
  );
  expect(global.fetch.mock.calls[0][1].body).toBeUndefined();
});

test('preserves shared API errors instead of turning failures into empty catalogs', async () => {
  global.fetch.mockResolvedValue({
    ok: false, status: 403, json: async () => ({ detail: 'Catalog access denied.' }),
  });

  await expect(getCatalog()).rejects.toEqual(
    expect.objectContaining({ name: 'ApiError', status: 403, message: 'Catalog access denied.' }),
  );
});

test('preserves network errors', async () => {
  global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(getCatalog()).rejects.toBeInstanceOf(NetworkError);
});

test('retains the shared error class for integration callers', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  await expect(getCatalog()).rejects.toBeInstanceOf(ApiError);
});
