import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { updateRelease } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import AboutPage from './AboutPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api', () => ({ ...jest.requireActual('../../api'), updateRelease: jest.fn() }));

const release = {
  team_number: 11,
  version_number: 'Sprint 1',
  release_date: '2026-09-15',
  product_name: 'Good Driver Incentive Program',
  product_description: 'A rewards program for safer driving.',
};

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('shows a loading state while release information is requested', () => {
  global.fetch.mockReturnValue(new Promise(() => {}));

  render(<AboutPage />);

  expect(screen.getByRole('status')).toHaveTextContent('Loading release information');
});

test('renders release information returned by the API', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => release,
  });

  render(<AboutPage />);

  expect(
    await screen.findByRole('heading', { name: release.product_name }),
  ).toBeInTheDocument();
  expect(screen.getByText(release.product_description)).toBeInTheDocument();
  expect(screen.getByText('Team 11')).toBeInTheDocument();
  expect(screen.getAllByText('Sprint 1')).toHaveLength(2);
  expect(screen.getAllByText('September 15, 2026')).toHaveLength(2);
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/about/',
    expect.objectContaining({
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }),
  );
});

test('explains when no release has been added yet', async () => {
  global.fetch.mockResolvedValue({ status: 404, ok: false });

  render(<AboutPage />);

  expect(await screen.findByRole('heading', { name: 'No release information yet' })).toBeInTheDocument();
  expect(screen.getByText(/add the product and release details in Django Admin/i)).toBeInTheDocument();
});

test('shows a readable error when the API request fails', async () => {
  global.fetch.mockRejectedValue(new Error('Network unavailable'));

  render(<AboutPage />);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent("Release information couldn't be loaded");
  });
});

test('shows a readable error when the API returns a failure response', async () => {
  global.fetch.mockResolvedValue({ ok: false });

  render(<AboutPage />);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent("Release information couldn't be loaded");
  });
});

test('allows a failed request to be retried', async () => {
  global.fetch
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce({ ok: true, json: async () => release });

  render(<AboutPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

  expect(
    await screen.findByRole('heading', { name: release.product_name }),
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('admins can edit the release details in place', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  global.fetch.mockResolvedValue({ ok: true, json: async () => release });
  updateRelease.mockResolvedValue({ ...release, version_number: 'Sprint 4' });

  render(<AboutPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit release details' }));
  fireEvent.change(screen.getByLabelText('Version'), { target: { value: 'Sprint 4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(updateRelease).toHaveBeenCalledWith(expect.objectContaining({ version_number: 'Sprint 4', team_number: 11 })));
  expect(await screen.findByRole('status', { name: '' })).toBeInTheDocument();
  expect(screen.getByText('Release details saved.')).toBeInTheDocument();
  expect(screen.getAllByText('Sprint 4').length).toBeGreaterThan(0);
});

test('other account types cannot edit the release', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  global.fetch.mockResolvedValue({ ok: true, json: async () => release });

  render(<AboutPage />);

  expect(await screen.findByRole('heading', { name: release.product_name })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit release details' })).not.toBeInTheDocument();
});
