import { act, renderHook, waitFor } from '@testing-library/react';

import * as api from 'api';
import { CartProvider, useCart } from './CartContext';
import { saveAttempt } from './pendingAttempt';

jest.mock('api');
// Deliberately recognizable UUID fixture, never an API credential.
const RESTORED_ATTEMPT_ID = '00000000-0000-4000-8000-000000000001';
const cart = { results: [{ product: { id: 1, name: 'Mug', point_cost: 100, is_available: true } }], item_count: 1, total_points: 100, point_balance: 500 };
const review = { ...cart, review_token: 'original-signed-review' };
const receipt = { reference: 'REDEMPTION-one', line_items: [{ name: 'Mug', unit_points: 100, quantity: 1 }], points_spent: 100, point_balance: 400 };
const wrapper = ({ children }) => <CartProvider ownerId={17} organization="First Freight">{children}</CartProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  api.getCart.mockResolvedValue(cart);
  api.reviewCart.mockResolvedValue(review);
});

test('uncertain checkout persists only recovery metadata and retries the same key and original token', async () => {
  api.checkout.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({
    ...cart, results: [], item_count: 0, total_points: 0, purchase: receipt,
  });
  const { result } = renderHook(() => useCart(), { wrapper });
  await act(async () => { await result.current.beginReview(); });
  await act(async () => { await result.current.checkout(); });
  const first = api.checkout.mock.calls[0][0];
  expect(result.current.pendingAttempt.key).toBe(first.idempotency_key);
  expect(sessionStorage.getItem('gdip.checkout.pending.17')).not.toContain('original-signed-review');
  await act(async () => { await result.current.add(2); });
  expect(api.addToCart).not.toHaveBeenCalled();
  await act(async () => { await result.current.checkout(); });
  expect(api.checkout.mock.calls[1][0]).toEqual(first);
  expect(result.current.lastPurchase.reference).toBe('REDEMPTION-one');
  expect(result.current.pendingAttempt).toBeNull();
  expect(sessionStorage.getItem('gdip.checkout.pending.17')).toBeNull();
});

test('a restored attempt offers read-only lookup; 404 keeps it pending and a receipt resolves it', async () => {
  const pending = { key: RESTORED_ATTEMPT_ID, startedAt: '2026-11-05T12:00:00Z', organization: 'Previous Sponsor' };
  saveAttempt(17, pending);
  api.lookupRedemption.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 })).mockResolvedValueOnce(receipt);
  const { result } = renderHook(() => useCart(), { wrapper });
  expect(result.current.canRetry).toBe(false);
  await act(async () => { await result.current.checkPurchaseStatus(); });
  expect(result.current.pendingAttempt.key).toBe(pending.key);
  expect(result.current.actionError).toMatch(/still be processing/);
  await act(async () => { await result.current.checkPurchaseStatus(); });
  expect(api.lookupRedemption).toHaveBeenCalledWith(pending.key);
  expect(api.checkout).not.toHaveBeenCalled();
  expect(result.current.lastPurchase).toEqual(receipt);
  expect(result.current.pendingAttempt).toBeNull();
});

test('a retry conflict never adopts a fresh review or discards the pending attempt', async () => {
  api.checkout.mockRejectedValueOnce(new Error('Lost response')).mockRejectedValueOnce(
    Object.assign(new Error('Changed'), { status: 409, data: { code: 'review_changed', review: { ...review, review_token: 'new-review' } } }),
  );
  const { result } = renderHook(() => useCart(), { wrapper });
  await act(async () => { await result.current.beginReview(); });
  await act(async () => { await result.current.checkout(); });
  await act(async () => { await result.current.checkout(); });
  expect(result.current.pendingAttempt).not.toBeNull();
  expect(result.current.canRetry).toBe(false);
  expect(api.readCartReview).not.toHaveBeenCalled();
});

test('another effective Driver does not restore the stored attempt', async () => {
  saveAttempt(18, { key: RESTORED_ATTEMPT_ID, startedAt: '2026-11-05T12:00:00Z', organization: 'Other' });
  const { result } = renderHook(() => useCart(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.pendingAttempt).toBeNull();
});
