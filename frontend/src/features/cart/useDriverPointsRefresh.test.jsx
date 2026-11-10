import { fireEvent, renderHook } from '@testing-library/react';

import { useCart } from './CartContext';
import useDriverPointsRefresh from './useDriverPointsRefresh';

jest.mock('./CartContext', () => ({ useCart: jest.fn() }));

test('refreshes both balance and history once per purchase and coalesces tab return events', () => {
  const balance = jest.fn();
  const history = jest.fn();
  useCart.mockReturnValue({ purchaseVersion: 0 });
  const { rerender, unmount } = renderHook(() => useDriverPointsRefresh(balance, history));
  expect(balance).not.toHaveBeenCalled();
  useCart.mockReturnValue({ purchaseVersion: 1 });
  rerender();
  expect(balance).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledTimes(1);
  fireEvent.focus(window);
  fireEvent(document, new Event('visibilitychange'));
  expect(balance).toHaveBeenCalledTimes(2);
  expect(history).toHaveBeenCalledTimes(2);
  unmount();
  fireEvent.focus(window);
  expect(balance).toHaveBeenCalledTimes(2);
});
