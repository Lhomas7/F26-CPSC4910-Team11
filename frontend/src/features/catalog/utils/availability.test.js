import { withConfirmedAvailability } from './availability';

const product = { id: 1, name: 'New name', price_usd: '25.00', is_available: true, updated_at: '2026-10-21T12:00:00Z' };

test('confirmed PATCH beats an older read without overwriting unrelated fields', () => {
  const merged = withConfirmedAvailability(product, {
    id: 1, name: 'Old name', price_usd: '12.50', is_available: false, updated_at: '2026-10-21T13:00:00Z',
  });
  expect(merged).toEqual({ ...product, is_available: false, updated_at: '2026-10-21T13:00:00Z' });
});

test('a newer read wins over an older locally confirmed update', () => {
  expect(withConfirmedAvailability(product, {
    id: 1, is_available: false, updated_at: '2026-10-21T11:00:00Z',
  })).toBe(product);
});

test('compares sub-millisecond server timestamps without rounding away version order', () => {
  const newer = { ...product, updated_at: '2026-10-21T12:00:00.123456Z' };
  expect(withConfirmedAvailability(newer, {
    id: 1, is_available: false, updated_at: '2026-10-21T12:00:00.123455Z',
  })).toBe(newer);
});

test('normalizes offset timestamps and optional fractional seconds for comparison', () => {
  const result = withConfirmedAvailability(product, {
    id: 1, is_available: false, updated_at: '2026-10-21T08:00:00.000001-04:00',
  });
  expect(result.is_available).toBe(false);
});

test('ignores a different product or invalid update timestamp', () => {
  expect(withConfirmedAvailability(product, { id: 2, updated_at: '2026-10-21T13:00:00Z' })).toBe(product);
  expect(withConfirmedAvailability(product, { id: 1, updated_at: 'bad' })).toBe(product);
});
