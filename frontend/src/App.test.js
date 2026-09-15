import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/about');
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        team_number: 11,
        version: 'Sprint 1',
        release_date: '2026-09-15',
        product_name: 'Good Driver Incentive Program',
        product_description: 'A rewards program for safer driving.',
      }),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders About information returned by the API', async () => {
  render(<App />);

  expect(await screen.findByText('Team 11')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Good Driver Incentive Program' })).toBeInTheDocument();
  expect(screen.getByText('Sprint 1')).toBeInTheDocument();
  expect(screen.getByText('September 15, 2026')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/about/',
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
});

test('shows a helpful message when About information cannot be loaded', async () => {
  global.fetch.mockRejectedValueOnce(new Error('network error'));

  render(<App />);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
  });
});
