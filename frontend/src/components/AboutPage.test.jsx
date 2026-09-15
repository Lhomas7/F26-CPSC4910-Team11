import { render, screen, waitFor } from '@testing-library/react';

import AboutPage from './AboutPage';

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
  expect(screen.getByText('Sprint 1')).toBeInTheDocument();
  expect(screen.getByText('September 15, 2026')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/about/',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

test('shows a readable error when the API request fails', async () => {
  global.fetch.mockRejectedValue(new Error('Network unavailable'));

  render(<AboutPage />);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
  });
});

test('shows a readable error when the API returns a failure response', async () => {
  global.fetch.mockResolvedValue({ ok: false });

  render(<AboutPage />);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
  });
});
