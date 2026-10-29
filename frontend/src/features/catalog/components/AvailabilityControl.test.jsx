import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { setProductAvailability } from '../../../api/catalog';
import AvailabilityControl from './AvailabilityControl';
import ProductCard from './ProductCard';
import ProductGrid from './ProductGrid';

jest.mock('../../../api/catalog');

const product = {
  id: 1,
  name: 'Travel Mug',
  description: '',
  image_url: '',
  price_usd: '12.50',
  is_available: true,
  updated_at: '2026-10-21T12:00:00Z',
};
const initialVersion = {};

function Harness({
  onSaved = jest.fn(),
  onAccessError = jest.fn(),
  onRefresh = jest.fn(),
  disabled = false,
  catalogVersion = initialVersion,
}) {
  const [confirmed, setConfirmed] = useState(product);
  return (
    <ProductGrid>
      <ProductCard
        product={confirmed}
        footer={
          <AvailabilityControl
            product={confirmed}
            disabled={disabled}
            catalogVersion={catalogVersion}
            onSaved={(updated) => {
              setConfirmed(updated);
              onSaved(updated);
            }}
            onAccessError={onAccessError}
            onRefresh={onRefresh}
          />
        }
      />
    </ProductGrid>
  );
}

beforeEach(() => setProductAvailability.mockReset());

test('preserves confirmed badge while saving, blocks duplicate submits, then flips after success', async () => {
  let finish;
  setProductAvailability.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark unavailable: Travel Mug' }));
  expect(screen.getByText('Available')).toBeInTheDocument();
  const saving = screen.getByRole('button', { name: 'Saving availability for Travel Mug' });
  expect(saving).toBeDisabled();
  expect(saving).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(saving);
  expect(setProductAvailability).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ ...product, is_available: false, updated_at: '2026-10-21T13:00:00Z' });
  });
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark available: Travel Mug' })).toBeEnabled();
});

test('failure preserves the confirmed state and retries the same requested value', async () => {
  setProductAvailability
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ ...product, is_available: false });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark unavailable: Travel Mug' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Last confirmed status: Available.');
  expect(screen.getByText('Available')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry availability update for Travel Mug' }));
  expect(await screen.findByText('Unavailable')).toBeInTheDocument();
  expect(setProductAvailability.mock.calls).toEqual([
    [1, false],
    [1, false],
  ]);
});

test('404 removes the mutation action and offers a catalog refresh, not blind retry', async () => {
  const onRefresh = jest.fn();
  setProductAvailability.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  render(<Harness onRefresh={onRefresh} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark unavailable: Travel Mug' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This product is no longer in your catalog.',
  );
  expect(
    screen.queryByRole('button', { name: /Mark unavailable|Retry availability/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test.each([401, 403, 409])('access/session failure %s is escalated to the page', async (status) => {
  const onAccessError = jest.fn();
  const error = Object.assign(new Error('Access ended'), { status });
  setProductAvailability.mockRejectedValue(error);
  render(<Harness onAccessError={onAccessError} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark unavailable: Travel Mug' }));
  await waitFor(() => expect(onAccessError).toHaveBeenCalledWith(error));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a fresh catalog read clears obsolete failure feedback', async () => {
  setProductAvailability.mockRejectedValue(new Error('Connection lost'));
  const { rerender } = render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark unavailable: Travel Mug' }));
  await screen.findByRole('alert');
  rerender(<Harness catalogVersion={{ refreshed: true }} />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark unavailable: Travel Mug' })).toBeEnabled();
});

test('refresh/loading disables writes without pretending they are saving', () => {
  render(<Harness disabled />);
  expect(screen.getByRole('button', { name: 'Mark unavailable: Travel Mug' })).toBeDisabled();
  expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
  expect(setProductAvailability).not.toHaveBeenCalled();
});
