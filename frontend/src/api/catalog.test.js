import { ApiError, NetworkError } from './client';
import { createProduct, getCatalog, setProductAvailability } from './catalog';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('uses the shared authenticated client without accepting browser-supplied ownership', async () => {
  const payload = {
    results: [], count: 0, next: null, previous: null,
    sponsor: { id: 1, name: 'Test Sponsor' }, point_balance: null,
    pricing: { status: 'unconfigured', points_per_dollar: null },
  };
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

test('requests page numbers without following arbitrary response URLs', async () => {
  global.fetch.mockResolvedValue({
    ok: true, status: 200, json: async () => ({
      results: [], count: 0, next: null, previous: null, sponsor: { id: 1, name: 'Test' },
      point_balance: null, pricing: { status: 'configured', points_per_dollar: 100 },
    }),
  });
  await getCatalog(2);
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/catalog\/\?page=2$/);
});

test.each([0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('rejects invalid page %s before requesting data', (page) => {
  expect(() => getCatalog(page)).toThrow(RangeError);
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([{}, { count: 0, results: [] }, { count: 0, results: null }])('rejects malformed successful catalog responses', async (data) => {
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => data });
  await expect(getCatalog()).rejects.toEqual(expect.objectContaining({ status: 502 }));
});

const savedProduct = {
  id: 7, name: 'Travel Mug', description: '', image_url: '', price_usd: '12.50',
  is_available: false, updated_at: '2026-10-21T15:00:00Z',
};

const driverCatalog = {
  results: [{ ...savedProduct, point_cost: 1250, can_afford: true }],
  count: 1, next: null, previous: null, sponsor: { id: 1, name: 'First Freight' },
  point_balance: 3200, pricing: { status: 'configured', points_per_dollar: 100 },
};

test.each([
  { pricing: undefined }, { pricing: {} },
  { pricing: { status: 'configured', points_per_dollar: 0 } },
  { pricing: { status: 'configured', points_per_dollar: '100' } },
  { pricing: { status: 'unconfigured', points_per_dollar: 100 } },
  { point_balance: '3200' }, { point_balance: undefined },
  { point_balance: Number.MAX_SAFE_INTEGER + 1 },
])('rejects malformed catalog pricing metadata/balance: %j', async (overrides) => {
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...driverCatalog, ...overrides }) });
  await expect(getCatalog()).rejects.toEqual(expect.objectContaining({ status: 502 }));
});

test.each([0, -1, 3200])('accepts the actual ledger balance %s without coercion', async (balance) => {
  const payload = { ...driverCatalog, point_balance: balance };
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload });
  await expect(getCatalog()).resolves.toEqual(payload);
});

test('leaves malformed individual derived prices for explicit unknown card feedback', async () => {
  const payload = { ...driverCatalog, results: [{ ...savedProduct, point_cost: null, can_afford: true }] };
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload });
  await expect(getCatalog()).resolves.toEqual(payload);
});

test('availability PATCH uses session cookies, CSRF, and only the boolean payload', async () => {
  document.cookie = 'csrftoken=catalog-test-token; path=/';
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => savedProduct });
  await expect(setProductAvailability(7, false)).resolves.toEqual(savedProduct);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/sponsor\/catalog\/products\/7\/availability\/$/),
    expect.objectContaining({
      method: 'PATCH', credentials: 'include', body: JSON.stringify({ is_available: false }),
      headers: expect.objectContaining({ 'X-CSRFToken': 'catalog-test-token' }),
    }),
  );
  document.cookie = 'csrftoken=; max-age=0; path=/';
});

test.each([null, 0, -1, '7', 1.5])('availability rejects invalid product ID %s', (id) => {
  expect(() => setProductAvailability(id, false)).toThrow(RangeError);
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([null, 'false', 0, undefined])('availability rejects non-boolean %s', (value) => {
  expect(() => setProductAvailability(7, value)).toThrow(TypeError);
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  {}, { ...savedProduct, id: 8 }, { ...savedProduct, is_available: true },
  { ...savedProduct, updated_at: 'invalid' },
])('availability does not accept an unconfirmed success response', async (data) => {
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => data });
  await expect(setProductAvailability(7, false)).rejects.toEqual(expect.objectContaining({ status: 502 }));
});

test('availability preserves a 404 response for refresh recovery', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: 'Not found.' }) });
  await expect(setProductAvailability(7, false)).rejects.toEqual(expect.objectContaining({ status: 404 }));
});

test('creation posts decimal money and boolean availability through the shared client', async () => {
  const payload = { name: 'Mug', description: '', price_usd: '0.00', image_url: '', is_available: false };
  const created = { ...savedProduct, ...payload };
  global.fetch.mockResolvedValue({ ok: true, status: 201, json: async () => created });
  await expect(createProduct(payload)).resolves.toEqual(created);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/sponsor\/catalog\/products\/$/),
    expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify(payload) }),
  );
});

test.each([
  [200, savedProduct], [201, {}], [201, { ...savedProduct, id: null }],
])('does not treat unconfirmed creation HTTP %s as success', async (status, data) => {
  global.fetch.mockResolvedValue({ ok: true, status, json: async () => data });
  await expect(createProduct({})).rejects.toEqual(expect.objectContaining({ status: 502 }));
});

test('creation does not automatically retry an uncertain network failure', async () => {
  global.fetch.mockRejectedValue(new TypeError('Connection lost'));
  await expect(createProduct({ name: 'Mug', price_usd: '12.50' })).rejects.toBeInstanceOf(NetworkError);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
