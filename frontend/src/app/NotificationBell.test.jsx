import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as api from '../api';
import NotificationBell from './NotificationBell';

jest.mock('../api');

afterEach(() => jest.clearAllMocks());

const ALERTS = {
  results: [
    {
      id: 2,
      category: 'points_added',
      message: 'Acme added 5 points.',
      read: false,
      created_at: '2026-10-20T12:00:00Z',
    },
    {
      id: 1,
      category: 'security',
      message: 'Your password was reset.',
      read: true,
      created_at: '2026-10-19T12:00:00Z',
    },
  ],
  unread_count: 1,
};

test('shows a red dot while there are unread alerts', async () => {
  api.listNotifications.mockResolvedValue(ALERTS);
  render(<NotificationBell />);

  expect(
    await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
  ).toBeInTheDocument();
  expect(screen.getByTestId('notification-dot')).toBeInTheDocument();
});

test('no dot when everything is read', async () => {
  api.listNotifications.mockResolvedValue({ results: [], unread_count: 0 });
  render(<NotificationBell />);

  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  expect(screen.queryByTestId('notification-dot')).not.toBeInTheDocument();
});

test('opening the panel lists alerts and marks them read', async () => {
  api.listNotifications.mockResolvedValue(ALERTS);
  api.markNotificationsRead.mockResolvedValue({
    results: ALERTS.results.map((item) => ({ ...item, read: true })),
    unread_count: 0,
  });
  render(<NotificationBell />);

  fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

  const panel = screen.getByRole('region', { name: 'Recent alerts' });
  expect(within(panel).getByText('Acme added 5 points.')).toBeInTheDocument();
  expect(within(panel).getByText('Your password was reset.')).toBeInTheDocument();
  await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalledWith());
  await waitFor(() => expect(screen.queryByTestId('notification-dot')).not.toBeInTheDocument());
  // The alert that was new when the panel opened stays labelled as unread.
  expect(within(panel).getAllByText('Unread')).toHaveLength(1);
});

test('view-as sessions never mark alerts read', async () => {
  api.listNotifications.mockResolvedValue(ALERTS);
  render(<NotificationBell viewingAs />);

  fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

  expect(screen.getByRole('region', { name: 'Recent alerts' })).toBeInTheDocument();
  expect(api.markNotificationsRead).not.toHaveBeenCalled();
});

test('Escape closes the panel', async () => {
  api.listNotifications.mockResolvedValue({ results: [], unread_count: 0 });
  render(<NotificationBell />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  expect(screen.getByText('No alerts yet.')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });

  expect(screen.queryByRole('region', { name: 'Recent alerts' })).not.toBeInTheDocument();
});

test('messages are rendered as text, not HTML', async () => {
  api.listNotifications.mockResolvedValue({
    results: [
      {
        id: 3,
        category: 'points_added',
        message: '<img src=x onerror=alert(1)>',
        read: true,
        created_at: '2026-10-20T12:00:00Z',
      },
    ],
    unread_count: 0,
  });
  render(<NotificationBell />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
