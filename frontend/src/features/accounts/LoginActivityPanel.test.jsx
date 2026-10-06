import { fireEvent, render, screen, within } from '@testing-library/react';

import * as api from '../../api';
import LoginActivityPanel from './LoginActivityPanel';

jest.mock('../../api');

afterEach(() => jest.clearAllMocks());

const attempts = [
  { id: 5, timestamp: '2026-10-06T15:00:00Z', successful: true },
  { id: 4, timestamp: '2026-10-06T14:00:00Z', successful: false },
  { id: 3, timestamp: '2026-10-06T13:00:00Z', successful: false },
  { id: 2, timestamp: '2026-10-06T12:00:00Z', successful: true },
  { id: 1, timestamp: '2026-10-06T11:00:00Z', successful: false },
];

function rows() {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

test('shows the last three attempts with their outcome and time', async () => {
  api.getLoginAttempts.mockResolvedValue({ recent: attempts.slice(0, 3), last_24_hours: attempts });
  render(<LoginActivityPanel />);

  expect(await screen.findByText('Your last 3 sign-in attempts')).toBeInTheDocument();
  const items = await screen.findAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent('Successful');
  expect(items[1]).toHaveTextContent('Failed');
  expect(within(items[0]).getByText(/2026/)).toHaveAttribute('dateTime', '2026-10-06T15:00:00Z');
});

test('show more reveals the last 24 hours and show less collapses it', async () => {
  api.getLoginAttempts.mockResolvedValue({ recent: attempts.slice(0, 3), last_24_hours: attempts });
  render(<LoginActivityPanel />);

  const toggle = await screen.findByRole('button', { name: 'Show more' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(rows()).toHaveLength(5);
  expect(screen.getByText('Sign-in attempts in the last 24 hours')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(rows()).toHaveLength(3);
});

test('hides show more when the last 24 hours adds nothing new', async () => {
  api.getLoginAttempts.mockResolvedValue({ recent: attempts.slice(0, 3), last_24_hours: attempts.slice(0, 2) });
  render(<LoginActivityPanel />);

  expect(await screen.findAllByRole('listitem')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
});

test('shows an empty state when there are no attempts', async () => {
  api.getLoginAttempts.mockResolvedValue({ recent: [], last_24_hours: [] });
  render(<LoginActivityPanel />);

  expect(await screen.findByText('No sign-in attempts recorded yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
});

test('shows an error and retries loading', async () => {
  api.getLoginAttempts.mockRejectedValueOnce(new Error('Network down'));
  api.getLoginAttempts.mockResolvedValueOnce({ recent: attempts.slice(0, 1), last_24_hours: attempts.slice(0, 1) });
  render(<LoginActivityPanel />);

  expect(await screen.findByRole('alert')).toHaveTextContent("couldn't be loaded");
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findAllByRole('listitem')).toHaveLength(1);
  expect(api.getLoginAttempts).toHaveBeenCalledTimes(2);
});
