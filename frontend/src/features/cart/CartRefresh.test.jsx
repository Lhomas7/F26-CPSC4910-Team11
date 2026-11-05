import { act, renderHook } from '@testing-library/react';

import * as api from 'api';
import { CartProvider, useCart } from './CartContext';

jest.mock('api');

test('a cart read started before checkout cannot restore old balance and items', async () => {
  let finishRead;
  api.getCart.mockReturnValue(new Promise((resolve) => { finishRead = resolve; }));
  const emptyCart = { results: [], item_count: 0, total_points: 0, point_balance: 750 };
  api.checkout.mockResolvedValue({ ...emptyCart, purchase: { points_spent: 1250 } });
  const wrapper = ({ children }) => <CartProvider>{children}</CartProvider>;
  const { result } = renderHook(() => useCart(), { wrapper });
  await act(async () => { await result.current.checkout(); });
  await act(async () => {
    finishRead({ results: [{ product: { id: 1 } }], item_count: 1, total_points: 1250, point_balance: 2000 });
  });
  expect(result.current.cart).toEqual(emptyCart);
  expect(result.current.purchaseVersion).toBe(1);
});
