import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../../api';
import { useAuth } from '../../../auth/AuthContext';
import SalesReportsPage from './SalesReportsPage';

jest.mock('../../../api');
jest.mock('../../../auth/AuthContext');

const options = {
  sponsors: [
    { id: 1, name: 'Alpha Logistics' },
    { id: 2, name: 'Beta Transit' },
  ],
  drivers: [],
};

const sponsorReport = {
  count: 2,
  next: null,
  previous: null,
  summary: {
    sale_count: 4,
    gross_sales_usd: '140.00',
    project_share_usd: '1.4000',
    project_share_rate_percent: '1.00',
  },
  results: [
    {
      sponsor: { id: 1, name: 'Alpha Logistics' },
      sale_count: 3,
      gross_sales_usd: '40.00',
      project_share_usd: '0.4000',
    },
    {
      sponsor: { id: 2, name: 'Beta Transit' },
      sale_count: 1,
      gross_sales_usd: '100.00',
      project_share_usd: '1.0000',
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SalesReportsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  api.getSalesReportOptions.mockResolvedValue(options);
  api.getSalesReport.mockResolvedValue(sponsorReport);
});

afterEach(() => jest.clearAllMocks());

test('runs an all-sponsor report and displays audited totals', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Run report' }));
  expect(await screen.findByText('Alpha Logistics')).toBeInTheDocument();
  expect(screen.getByText('$140.00')).toBeInTheDocument();
  expect(screen.getByText('$1.4000')).toBeInTheDocument();
  expect(api.getSalesReport).toHaveBeenCalledWith({
    groupBy: 'sponsor', sponsorId: 'all', driverId: 'all', page: 1,
  });
});

test('loads selected sponsor drivers and runs one-driver scope', async () => {
  api.getSalesReportOptions
    .mockResolvedValueOnce(options)
    .mockResolvedValueOnce({
      ...options,
      drivers: [{ id: 8, name: 'Alice Driver', username: 'alice.driver' }],
    });
  api.getSalesReport.mockResolvedValue({
    ...sponsorReport,
    count: 1,
    results: [{
      driver: { id: 8, name: 'Alice Driver', username: 'alice.driver' },
      sponsor: { id: 1, name: 'Alpha Logistics' },
      sale_count: 2,
      gross_sales_usd: '34.95',
      project_share_usd: '0.3495',
    }],
  });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Report type' }));
  fireEvent.click(screen.getByRole('option', { name: 'Sales by driver' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sponsor organization' }));
  fireEvent.click(screen.getByRole('option', { name: 'Alpha Logistics' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Driver' }));
  fireEvent.click(screen.getByRole('option', { name: /Alice Driver/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  const table = await screen.findByRole('table');
  expect(within(table).getByText('@alice.driver')).toBeInTheDocument();
  expect(api.getSalesReport).toHaveBeenCalledWith({
    groupBy: 'driver', sponsorId: '1', driverId: '8', page: 1,
  });
});

test('shows empty and retry states', async () => {
  api.getSalesReport.mockResolvedValueOnce({
    ...sponsorReport,
    count: 0,
    summary: {
      ...sponsorReport.summary,
      sale_count: 0,
      gross_sales_usd: '0.00',
      project_share_usd: '0.0000',
    },
    results: [],
  });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Run report' }));
  expect(await screen.findByText('No completed sales in this scope')).toBeInTheDocument();
});

test('does not load report data for a non-admin', () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  renderPage();
  expect(screen.getByRole('heading', { name: /don't have access/i })).toBeInTheDocument();
  expect(api.getSalesReportOptions).not.toHaveBeenCalled();
  expect(api.getSalesReport).not.toHaveBeenCalled();
});

