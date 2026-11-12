import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { getPurchase, getPurchases, getSponsorPurchase, getSponsorPurchases } from 'api/purchases';
import { useAuth } from 'auth/AuthContext';
import {
  DriverPurchaseDetailPage,
  DriverPurchaseHistoryPage,
  SponsorPurchaseDetailPage,
  SponsorPurchaseHistoryPage,
} from './PurchasePages';

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
        <Route path="/drivers/:driverId/purchases" element={<SponsorPurchaseHistoryPage />} />
        <Route
          path="/drivers/:driverId/purchases/:purchaseId"
          element={<SponsorPurchaseDetailPage />}
        />
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

test('resets pagination for a local date range and keeps filters when returning from the receipt', async () => {
  useAuth.mockReturnValue({ user: { id: 24, account_type: 'sponsor' } });
  getSponsorPurchases.mockResolvedValue({ results: [purchase], next: null, previous: null });
  getSponsorPurchase.mockResolvedValue(purchase);
  renderPurchases('/drivers/12/purchases?page=2');

  await screen.findByRole('link', { name: 'Trail Mug' });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-12' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-11-12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

  const receiptLink = await screen.findByRole('link', { name: 'Trail Mug' });
  expect(getSponsorPurchases).toHaveBeenLastCalledWith('12', 1, {
    from: new Date(2026, 10, 12).toISOString(),
    before: new Date(2026, 10, 13).toISOString(),
  });
  fireEvent.click(receiptLink);
  expect(await screen.findByText('reward-42')).toBeInTheDocument();
  expect(getSponsorPurchase).toHaveBeenCalledWith('12', '42');
  expect(screen.getByRole('link', { name: 'Driver purchase history' })).toHaveAttribute(
    'href',
    '/drivers/12/purchases?from=2026-11-12&through=2026-11-12',
  );
});

test('shows an empty filtered Sponsor history after retry and can clear the dates', async () => {
  useAuth.mockReturnValue({ user: { id: 24, account_type: 'sponsor' } });
  const empty = { results: [], next: null, previous: null };
  getSponsorPurchases.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(empty);
  renderPurchases('/drivers/12/purchases?from=2026-11-12&through=2026-11-12');

  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/No completed purchases match/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await screen.findByText(/No completed purchases match/)).toBeInTheDocument();
  expect(screen.getByLabelText('From')).toHaveValue('');
  expect(screen.getByLabelText('Through')).toHaveValue('');
  expect(getSponsorPurchases).toHaveBeenLastCalledWith('12', 1, {
    from: undefined,
    before: undefined,
  });
});

test('can retry a purchase receipt opened directly', async () => {
  getPurchase.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(purchase);
  renderPurchases('/purchases/42');

  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('reward-42')).toBeInTheDocument();
  expect(getPurchase).toHaveBeenCalledTimes(2);
});

test.each([
  ['America/Los_Angeles', /Nov 11, 2026.*6:05 PM/],
  ['Asia/Tokyo', /Nov 12, 2026.*11:05 AM/],
])('shows the local calendar day in %s on both history and receipt', async (timeZone, label) => {
  const original = Date.prototype.toLocaleString;
  const localClock = jest
    .spyOn(Date.prototype, 'toLocaleString')
    .mockImplementation(function (locale, options) {
      return original.call(this, locale, { timeZone, ...options });
    });
  try {
    const midnightPurchase = { ...purchase, completed_at: '2026-11-12T02:05:00Z' };
    getPurchases.mockResolvedValue({ results: [midnightPurchase], next: null, previous: null });
    getPurchase.mockResolvedValue(midnightPurchase);
    renderPurchases();

    expect(await screen.findByText(label)).toHaveAttribute(
      'datetime',
      midnightPurchase.completed_at,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Trail Mug' }));
    expect(await screen.findByText(label)).toHaveAttribute(
      'datetime',
      midnightPurchase.completed_at,
    );
    expect(screen.getByText('reward-42')).toBeInTheDocument();
  } finally {
    localClock.mockRestore();
  }
});
