import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../api';
import { useAuth } from '../../auth/AuthContext';
import InvoicePage from './InvoicePage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

const invoice = {
  sponsor: { id: 7, name: 'Palmetto Freight' },
  period: { start: '2026-10-01', end: '2026-10-31' },
  issued_on: '2026-11-02',
  points_per_dollar: 100,
  basis: 'Points awarded during the period.',
  lines: [
    { driver: 'Avery Driver', username: 'avery', points_awarded: 1250, points_removed: 50, transactions: 3 },
  ],
  totals: { points_awarded: 1250, points_removed: 50, transactions: 3, amount_due: '12.50' },
};

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InvoicePage />
    </MemoryRouter>,
  );
}

async function chooseSponsor() {
  await screen.findByRole('option', { name: 'Palmetto Freight' });
  fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: '7' } });
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  api.getAdminSponsorOrganizations.mockResolvedValue([{ id: 7, name: 'Palmetto Freight' }]);
  api.getInvoice.mockResolvedValue(invoice);
});

afterEach(() => jest.clearAllMocks());

test('generates an invoice for the chosen sponsor and billing period', async () => {
  renderPage();
  await chooseSponsor();
  fireEvent.change(screen.getByLabelText('Billing period start'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Billing period end'), { target: { value: '2026-10-31' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));

  await waitFor(() =>
    expect(api.getInvoice).toHaveBeenCalledWith({
      sponsor: '7',
      start: '2026-10-01',
      end: '2026-10-31',
    }),
  );
  expect(await screen.findByText('Invoice for Palmetto Freight')).toBeInTheDocument();
  expect(screen.getByText('$12.50')).toBeInTheDocument();
  expect(screen.getByText('Avery Driver', { exact: false })).toBeInTheDocument();
});

test('a sponsor and a valid period are required before asking the server', async () => {
  renderPage();
  await screen.findByRole('option', { name: 'Palmetto Freight' });

  fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a sponsor organization.');

  fireEvent.change(screen.getByLabelText('Sponsor'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Billing period start'), { target: { value: '2026-10-31' } });
  fireEvent.change(screen.getByLabelText('Billing period end'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));

  expect(screen.getByRole('alert')).toHaveTextContent(/on or after the start date/i);
  expect(api.getInvoice).not.toHaveBeenCalled();
});

test('a server error is shown and no stale invoice stays on screen', async () => {
  renderPage();
  await chooseSponsor();
  fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));
  await screen.findByText('Invoice for Palmetto Freight');

  api.getInvoice.mockRejectedValueOnce(new Error('The date range can be at most 366 days.'));
  fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('at most 366 days');
  expect(screen.queryByText('Invoice for Palmetto Freight')).not.toBeInTheDocument();
});

test('an empty period says so', async () => {
  api.getInvoice.mockResolvedValue({
    ...invoice,
    lines: [],
    totals: { points_awarded: 0, points_removed: 0, transactions: 0, amount_due: '0.00' },
  });
  renderPage();
  await chooseSponsor();
  fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));

  expect(await screen.findByText(/No points were awarded/)).toBeInTheDocument();
});

test('non-admins get an access message', () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  renderPage();

  expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
  expect(api.getAdminSponsorOrganizations).not.toHaveBeenCalled();
});
