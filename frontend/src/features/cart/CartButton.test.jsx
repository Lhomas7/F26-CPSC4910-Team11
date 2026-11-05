import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { checkout, getCart, removeFromCart, reviewCart } from 'api/cart';
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
  expect(document.querySelector('.cart-button')).not.toBeVisible();
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
  expect(within(dialog).getByText('Unavailable')).toBeInTheDocument();
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
    await within(dialog).findByText('Purchase complete.'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('REDEMPTION-test')).toBeInTheDocument();
  expect(checkout).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.cart-button')).not.toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  const reopened = await openDrawer(0);
  expect(within(reopened).getByText('REDEMPTION-test')).toBeInTheDocument();
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
