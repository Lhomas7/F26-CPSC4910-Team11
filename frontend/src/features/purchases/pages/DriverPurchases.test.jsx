import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { getPurchase, getPurchases } from 'api/purchases';
import { useAuth } from 'auth/AuthContext';
import { DriverPurchaseDetailPage, DriverPurchaseHistoryPage } from './DriverPurchases';

jest.mock('api/purchases');
jest.mock('auth/AuthContext');

const purchase = {
  id: 42,
  reference: 'reward-42',
  completed_at: '2026-11-12T19:05:00Z',
  status: 'completed',
  total_points: 1250,
  items: [{ id: 1, product_name: 'Trail Mug', quantity: 2, unit_points: 625 }],
};

function renderPurchases(path = '/purchases') {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/purchases" element={<DriverPurchaseHistoryPage />} />
        <Route path="/purchases/:purchaseId" element={<DriverPurchaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  useAuth.mockReturnValue({ user: { id: 12, account_type: 'driver' } });
});

test('follows the next page and opens the historical purchase details', async () => {
  getPurchases
    .mockResolvedValueOnce({ results: [{ ...purchase, id: 43 }], next: 'next', previous: null })
    .mockResolvedValueOnce({ results: [purchase], next: null, previous: 'previous' });
  getPurchase.mockResolvedValue(purchase);
  renderPurchases();

  fireEvent.click(await screen.findByRole('link', { name: 'Next' }));
  expect(await screen.findByText('Page 2')).toBeInTheDocument();
  expect(getPurchases).toHaveBeenLastCalledWith(2);
  fireEvent.click(screen.getByRole('link', { name: 'Trail Mug' }));

  expect(await screen.findByText('reward-42')).toBeInTheDocument();
  expect(getPurchase).toHaveBeenCalledWith('42');
  expect(screen.getByText('Completed')).toBeInTheDocument();
  expect(screen.getByText('2 × 625 points')).toBeInTheDocument();
  expect(screen.getByText(/Nov 12, 2026.*[AP]M/)).toHaveAttribute(
    'datetime',
    purchase.completed_at,
  );
});

test('offers a retry when loading fails and displays an empty history after recovery', async () => {
  getPurchases.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ results: [] });
  renderPurchases();

  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'No purchases yet' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Browse rewards' })).toHaveAttribute('href', '/catalog');
});

test('shows an unavailable purchase after the API denies a lookup with 404', async () => {
  getPurchase.mockRejectedValue({ status: 404 });
  renderPurchases('/purchases/42');

  expect(await screen.findByRole('heading', { name: 'Purchase unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Purchase history' })).toHaveAttribute(
    'href',
    '/purchases',
  );
});
