import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../api';
import { useAuth } from '../../auth/AuthContext';
import AuditLogPage from './AuditLogPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

const event = {
  id: 'points-1',
  timestamp: '2026-10-10T12:00:00Z',
  category: 'points',
  action: 'points_added',
  actor: 'pat.sponsor',
  target: 'avery.driver',
  detail: '+50 points. Clean inspection',
};

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuditLogPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  api.getAuditLog.mockResolvedValue({ results: [event], truncated: false, limit: 100, range: {} });
  api.auditLogCsvUrl.mockReturnValue('http://api.test/audit-log/?export=csv');
});

afterEach(() => jest.clearAllMocks());

test('shows the events returned for the default range', async () => {
  renderPage();

  expect(await screen.findByText('Clean inspection', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('Points added')).toBeInTheDocument();
  expect(api.getAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({ category: 'all', start: expect.any(String), end: expect.any(String) }),
  );
});

test('applying a date range and activity reloads the report with them', async () => {
  renderPage();
  await screen.findByText('Clean inspection', { exact: false });

  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-30' } });
  fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'sign_in' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

  await waitFor(() =>
    expect(api.getAuditLog).toHaveBeenLastCalledWith({
      start: '2026-09-01',
      end: '2026-09-30',
      category: 'sign_in',
    }),
  );
});

test('an end date before the start date is refused without asking the server', async () => {
  renderPage();
  await screen.findByText('Clean inspection', { exact: false });
  api.getAuditLog.mockClear();

  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-31' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(screen.getByRole('alert')).toHaveTextContent(/on or after the start date/i);
  expect(api.getAuditLog).not.toHaveBeenCalled();
});

test('an empty period and a cut-off report are both explained', async () => {
  api.getAuditLog.mockResolvedValueOnce({ results: [], truncated: false, limit: 100, range: {} });
  const { unmount } = renderPage();
  expect(await screen.findByText('No activity in this period')).toBeInTheDocument();
  unmount();

  api.getAuditLog.mockResolvedValueOnce({ results: [event], truncated: true, limit: 1, range: {} });
  renderPage();
  expect(await screen.findByText(/Only the newest 1 events are shown/)).toBeInTheDocument();
});

test('offers the same selection as a CSV download', async () => {
  renderPage();
  await screen.findByText('Clean inspection', { exact: false });

  expect(screen.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
    'href',
    'http://api.test/audit-log/?export=csv',
  );
});

test('non-admins get an access message instead of a request', () => {
  useAuth.mockReturnValue({ user: { account_type: 'driver' } });
  renderPage();

  expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
  expect(api.getAuditLog).not.toHaveBeenCalled();
});
