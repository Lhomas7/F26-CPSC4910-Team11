import { request } from './client';
import { checkout, lookupRedemption, reviewCart } from './cart';

jest.mock('./client', () => ({ ...jest.requireActual('./client'), request: jest.fn() }));
const cart = { results: [], item_count: 0, total_points: 0, point_balance: 400 };
const purchase = { redemption_id: 1, reference: 'REDEMPTION-one', points_spent: 100,
  point_balance: 400, replayed: false, completed_at: '2026-11-05T12:00:00Z',
  line_items: [{ name: 'Mug', unit_points: 100, quantity: 1 }] };
const respond = (data) => request.mockResolvedValue({ ok: true, status: 200, json: async () => data });

test('review requires a server token and checkout sends the exact attempt', async () => {
  respond({ ...cart, review_token: 'signed' });
  expect((await reviewCart()).review_token).toBe('signed');
  expect(request).toHaveBeenCalledWith('/cart/review/', { method: 'POST', body: {} });
  respond({ ...cart, purchase });
  const attempt = { idempotency_key: 'key', review_token: 'signed' };
  await checkout(attempt);
  expect(request).toHaveBeenLastCalledWith('/cart/checkout/', { method: 'POST', body: attempt });
});

test('an inconsistent successful receipt remains an uncertain error', async () => {
  respond({ ...cart, purchase: { ...purchase, points_spent: 1 } });
  await expect(checkout({})).rejects.toMatchObject({ status: 502 });
});

test('receipt recovery performs an exact-key read', async () => {
  respond({ purchase });
  expect(await lookupRedemption('one-key')).toEqual(purchase);
  expect(request).toHaveBeenLastCalledWith('/cart/redemptions/by-key/one-key/');
});
