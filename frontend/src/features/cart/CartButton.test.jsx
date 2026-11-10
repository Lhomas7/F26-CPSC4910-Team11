import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { checkout, clearCart, getCart, removeFromCart, reviewCart } from 'api/cart';
import CartButton from './CartButton';
import { CartProvider } from './CartContext';

jest.mock('api/cart');

const mug = {
  id: 1,
  name: 'Travel Mug',
  description: '',
  image_url: '',
  price_usd: '24.95',
  point_cost: 2495,
  can_afford: true,
  is_available: true,
};
const jacket = { ...mug, id: 2, name: 'Jacket', point_cost: 4000, can_afford: false };

const cartWith = (products, balance = 3200) => ({
  results: products.map((p) => ({ id: p.id, product: p, added_at: '2026-11-05T12:00:00Z' })),
  item_count: products.length,
  total_points: products.reduce((sum, p) => sum + p.point_cost, 0),
  point_balance: balance,
});

function renderButton(props = {}) {
  return render(
    <MemoryRouter><CartProvider {...props}>
      <CartButton />
    </CartProvider></MemoryRouter>,
  );
}

beforeEach(() => {
  getCart.mockReset();
  removeFromCart.mockReset();
  checkout.mockReset();
  clearCart.mockReset();
  reviewCart.mockImplementation(async () => ({ ...await getCart(), review_token: 'review-token' }));
});

async function openDrawer(count) {
  fireEvent.click(
    await screen.findByRole('button', { name: `Cart, ${count} ${count === 1 ? 'item' : 'items'}` }),
  );
  return screen.findByRole('dialog');
}

test('renders nothing outside a driver cart', () => {
  render(<CartButton />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('shows the item count on the cart button', async () => {
  getCart.mockResolvedValue(cartWith([mug, jacket]));
  renderButton();
  expect(await screen.findByRole('button', { name: 'Cart, 2 items' })).toBeInTheDocument();
});

test('the drawer lists items, totals and the shortfall, and removes items', async () => {
  getCart.mockResolvedValue(cartWith([mug, jacket]));
  removeFromCart.mockResolvedValue(cartWith([mug]));
  renderButton();
  fireEvent.click(await screen.findByRole('button', { name: 'Cart, 2 items' }));

  const dialog = await screen.findByRole('dialog', { name: 'Your cart (2)' });
  const list = within(dialog).getByRole('list', { name: 'Rewards in your cart' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(within(dialog).getByText('6,495 points')).toBeInTheDocument();
  expect(within(dialog).getByText('3,200 points')).toBeInTheDocument();
  expect(within(dialog).getByText(/You need 3,295 points more/)).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Jacket from cart' }));
  expect(removeFromCart).toHaveBeenCalledWith(2);
  expect(await screen.findByRole('dialog', { name: 'Your cart (1)' })).toBeInTheDocument();
  expect(screen.queryByText(/You need/)).not.toBeInTheDocument();
  expect(screen.getByTitle('Cart')).not.toBeVisible();
});

test('empty cart explains how to add rewards', async () => {
  getCart.mockResolvedValue(cartWith([]));
  renderButton();
  fireEvent.click(await screen.findByRole('button', { name: 'Cart, 0 items' }));
  expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
});

test('unavailable items are flagged and can still be removed', async () => {
  getCart.mockResolvedValue(cartWith([{ ...mug, is_available: false }]));
  renderButton();
  fireEvent.click(await screen.findByRole('button', { name: 'Cart, 1 item' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Out of stock')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Remove Travel Mug from cart' })).toBeEnabled();
});

test('pending drivers see why the cart is unavailable', async () => {
  const error = Object.assign(new Error('Forbidden'), {
    status: 403,
    data: { code: 'driver_not_approved' },
  });
  getCart.mockRejectedValue(error);
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'Cart, 0 items' }));
  expect(await screen.findByText(/must approve your Driver account/)).toBeInTheDocument();
});

test('View-As shows the cart read-only', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  renderButton({ viewingAs: true });
  fireEvent.click(await screen.findByRole('button', { name: 'Cart, 1 item' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/cart is read-only/)).toBeInTheDocument();
  expect(
    within(dialog).getByRole('button', { name: 'Remove Travel Mug from cart' }),
  ).toBeDisabled();
});

test('Escape closes the drawer', async () => {
  getCart.mockResolvedValue(cartWith([]));
  renderButton();
  fireEvent.click(await screen.findByRole('button', { name: 'Cart, 0 items' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('checkout asks for confirmation, spends points and empties the cart', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  checkout.mockResolvedValue({
    ...cartWith([], 705),
    purchase: { items: ['Travel Mug'], points_spent: 2495, point_balance: 705,
      line_items: [{ name: 'Travel Mug', unit_points: 2495, quantity: 1 }],
      reference: 'REDEMPTION-test', completed_at: '2026-11-05T12:00:00Z', replayed: false },
  });
  renderButton();
  const dialog = await openDrawer(1);

  fireEvent.click(await within(dialog).findByRole('button', { name: 'Check out' }));
  expect(checkout).not.toHaveBeenCalled();
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Confirm purchase' }));

  expect(
    await within(dialog).findByText('Order submitted! You used 2,495 points. Your new balance is 705 points.'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('Travel Mug')).toBeInTheDocument();
  expect(within(dialog).queryByText(/REDEMPTION/)).not.toBeInTheDocument();
  expect(checkout).toHaveBeenCalledTimes(1);
  expect(screen.getByTitle('Cart')).not.toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  const reopened = await openDrawer(0);
  expect(within(reopened).getByRole('status')).toHaveTextContent('Order submitted!');
});

test('an uncertain attempt survives closing the drawer and blocks a new purchase', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  checkout.mockRejectedValue(new Error('Connection lost'));
  renderButton();
  const dialog = await openDrawer(1);
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Check out' })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Check out' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Confirm purchase' }));
  expect(await within(dialog).findByText('This purchase hasn’t been confirmed')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cart, purchase needs attention' }));
  expect(await screen.findByRole('button', { name: 'Check purchase status' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
});

test('checkout is disabled when the driver is short of points', async () => {
  getCart.mockResolvedValue(cartWith([mug, jacket]));
  renderButton();
  const dialog = await openDrawer(2);
  expect(await within(dialog).findByRole('button', { name: 'Check out' })).toBeDisabled();
});

test('checkout is disabled while a reward is unavailable', async () => {
  getCart.mockResolvedValue(cartWith([{ ...mug, is_available: false }]));
  renderButton();
  const dialog = await openDrawer(1);
  expect(await within(dialog).findByRole('button', { name: 'Check out' })).toBeDisabled();
});

test('checkout is disabled during View-As', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  renderButton({ viewingAs: true });
  const dialog = await openDrawer(1);
  expect(await within(dialog).findByRole('button', { name: 'Check out' })).toBeDisabled();
});

test('a failed checkout shows the error and keeps the cart', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  checkout.mockRejectedValue(Object.assign(new Error('This purchase needs 2,495 points, but your balance is 0.'), { status: 400 }));
  renderButton();
  const dialog = await openDrawer(1);
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Check out' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Confirm purchase' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/your balance is 0/);
  expect(within(dialog).getByRole('list', { name: 'Rewards in your cart' })).toBeInTheDocument();
});

test('the totals show the item count, total price and balance after purchase', async () => {
  getCart.mockResolvedValue(cartWith([mug], 3200));
  renderButton();
  const dialog = await openDrawer(1);

  const check = await within(dialog).findByRole('group', { name: 'Points check' });
  expect(check).toHaveTextContent(
    'Items1Total price2,495 pointsCurrent balance3,200 pointsBalance after purchase705 points',
  );
  expect(check).not.toHaveClass('is-short');
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
});

test('a short balance turns the totals red and shows how many more points are needed', async () => {
  getCart.mockResolvedValue(cartWith([mug, jacket], 3200));
  renderButton();
  const dialog = await openDrawer(2);

  const check = await within(dialog).findByRole('group', { name: 'Points check' });
  expect(check).toHaveClass('is-short');
  expect(within(check).getByRole('alert')).toHaveTextContent(
    'You need 3,295 points more for these items.',
  );
  expect(within(check).getByText('−3,295 points')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Check out' })).toBeDisabled();
});

test('the review also blocks confirming when the balance changed and is now short', async () => {
  getCart.mockResolvedValue(cartWith([mug], 3200));
  reviewCart.mockResolvedValue({ ...cartWith([mug], 1000), review_token: 'review-token' });
  renderButton();
  const dialog = await openDrawer(1);

  fireEvent.click(await within(dialog).findByRole('button', { name: 'Check out' }));
  expect(await within(dialog).findByText('You need 1,495 points more for these items.')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Confirm purchase' })).toBeDisabled();
  expect(checkout).not.toHaveBeenCalled();
});

test('out-of-stock rewards are highlighted and can be removed together', async () => {
  const soldOutMug = { ...mug, is_available: false };
  const soldOutJacket = { ...jacket, id: 3, name: 'Rain Jacket', point_cost: 100, is_available: false };
  const shirt = { ...mug, id: 4, name: 'Shirt', point_cost: 100 };
  getCart.mockResolvedValue(cartWith([soldOutMug, soldOutJacket, shirt]));
  removeFromCart
    .mockResolvedValueOnce(cartWith([soldOutJacket, shirt]))
    .mockResolvedValueOnce(cartWith([shirt]));
  renderButton();
  const dialog = await openDrawer(3);

  expect(await within(dialog).findByText('2 rewards in your cart are no longer available and can’t be purchased.')).toBeInTheDocument();
  const items = within(dialog).getAllByRole('listitem');
  expect(items[0]).toHaveClass('cart-item-unavailable');
  expect(items[2]).not.toHaveClass('cart-item-unavailable');
  expect(within(dialog).getByRole('button', { name: 'Check out' })).toBeDisabled();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove unavailable items' }));
  expect(await screen.findByRole('dialog', { name: 'Your cart (1)' })).toBeInTheDocument();
  expect(removeFromCart.mock.calls).toEqual([[1], [3]]);
  expect(screen.queryByText(/no longer available/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check out' })).toBeEnabled();
});

test('the cart is loaded from the server each time the app starts', async () => {
  getCart.mockResolvedValue(cartWith([mug, jacket]));
  const { unmount } = renderButton();
  expect(await screen.findByRole('button', { name: 'Cart, 2 items' })).toBeInTheDocument();
  unmount();

  renderButton();
  expect(await screen.findByRole('button', { name: 'Cart, 2 items' })).toBeInTheDocument();
  expect(getCart).toHaveBeenCalledTimes(2);
});

test('clear cart asks for confirmation, then empties the cart', async () => {
  getCart.mockResolvedValue(cartWith([mug, jacket]));
  clearCart.mockResolvedValue(cartWith([]));
  renderButton();
  const dialog = await openDrawer(2);

  fireEvent.click(await within(dialog).findByRole('button', { name: 'Clear cart' }));
  const confirm = within(dialog).getByRole('alertdialog', { name: 'Remove all 2 items from your cart?' });
  expect(clearCart).not.toHaveBeenCalled();
  expect(within(dialog).queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();

  fireEvent.click(within(confirm).getByRole('button', { name: 'Clear cart' }));
  expect(await within(dialog).findByText('Your cart is empty.')).toBeInTheDocument();
  expect(clearCart).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog', { name: 'Your cart (0)' })).toBeInTheDocument();
});

test('keeping items cancels clearing the cart', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  renderButton();
  const dialog = await openDrawer(1);

  fireEvent.click(await within(dialog).findByRole('button', { name: 'Clear cart' }));
  expect(within(dialog).getByRole('alertdialog', { name: 'Remove the 1 item from your cart?' })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep items' }));

  expect(within(dialog).queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Check out' })).toBeEnabled();
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
  expect(clearCart).not.toHaveBeenCalled();
});

test('a failed clear shows the error and keeps the cart', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  clearCart.mockRejectedValue(new Error('Your cart could not be cleared right now.'));
  renderButton();
  const dialog = await openDrawer(1);

  fireEvent.click(await within(dialog).findByRole('button', { name: 'Clear cart' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear cart' }));

  expect(await within(dialog).findByText('Your cart could not be cleared right now.')).toBeInTheDocument();
  expect(within(dialog).getByRole('list', { name: 'Rewards in your cart' })).toBeInTheDocument();
});

test('View-As cannot clear the cart', async () => {
  getCart.mockResolvedValue(cartWith([mug]));
  renderButton({ viewingAs: true });
  const dialog = await openDrawer(1);
  await within(dialog).findByRole('button', { name: 'Check out' });
  expect(within(dialog).queryByRole('button', { name: 'Clear cart' })).not.toBeInTheDocument();
});

test('a free order confirms that no points were deducted', async () => {
  getCart.mockResolvedValue(cartWith([{ ...mug, point_cost: 0 }]));
  checkout.mockResolvedValue({
    ...cartWith([], 3200),
    purchase: { items: ['Travel Mug'], points_spent: 0, point_balance: 3200,
      line_items: [{ name: 'Travel Mug', unit_points: 0, quantity: 1 }],
      reference: 'REDEMPTION-free', completed_at: '2026-11-05T12:00:00Z', replayed: false },
  });
  renderButton();
  const dialog = await openDrawer(1);

  fireEvent.click(await within(dialog).findByRole('button', { name: 'Check out' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Confirm purchase' }));

  expect(await within(dialog).findByRole('status')).toHaveTextContent('Order submitted! No points were deducted.');
});
