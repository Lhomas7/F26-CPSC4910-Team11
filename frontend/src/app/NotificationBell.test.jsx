import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as api from '../api';
import NotificationBell from './NotificationBell';
import { announceNotificationsChanged } from './notificationEvents';

jest.mock('../api');

afterEach(() => jest.clearAllMocks());

/** Open the panel and wait for the refresh that opening triggers. */
async function openPanel(button) {
  const calls = api.listNotifications.mock.calls.length;
  fireEvent.click(button);
  await waitFor(() => expect(api.listNotifications.mock.calls.length).toBeGreaterThan(calls));
  await screen.findByRole('region', { name: 'Recent alerts' });
}

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

  await openPanel(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

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

  await openPanel(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

  expect(screen.getByRole('region', { name: 'Recent alerts' })).toBeInTheDocument();
  expect(api.markNotificationsRead).not.toHaveBeenCalled();
});

test('Escape closes the panel', async () => {
  api.listNotifications.mockResolvedValue({ results: [], unread_count: 0 });
  render(<NotificationBell />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());

  await openPanel(screen.getByRole('button', { name: 'Notifications' }));
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

  await openPanel(screen.getByRole('button', { name: 'Notifications' }));

  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('the × clears a single alert', async () => {
  api.listNotifications.mockResolvedValue({ ...ALERTS, unread_count: 0 });
  api.clearNotification.mockResolvedValue(null);
  render(<NotificationBell />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());

  await openPanel(screen.getByRole('button', { name: 'Notifications' }));
  const panel = screen.getByRole('region', { name: 'Recent alerts' });
  fireEvent.click(within(panel).getAllByRole('button', { name: 'Clear notification' })[0]);

  await waitFor(() =>
    expect(within(panel).queryByText('Acme added 5 points.')).not.toBeInTheDocument(),
  );
  expect(api.clearNotification).toHaveBeenCalledWith(2);
  expect(within(panel).getByText('Your password was reset.')).toBeInTheDocument();
});

test('Clear all empties the panel', async () => {
  api.listNotifications.mockResolvedValue({ ...ALERTS, unread_count: 0 });
  api.clearAllNotifications.mockResolvedValue({ results: [], unread_count: 0 });
  render(<NotificationBell />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());

  await openPanel(screen.getByRole('button', { name: 'Notifications' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

  expect(await screen.findByText('No alerts yet.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled();
});

test('view-as sessions cannot clear alerts', async () => {
  api.listNotifications.mockResolvedValue(ALERTS);
  render(<NotificationBell viewingAs />);

  await openPanel(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

  expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear notification' })).not.toBeInTheDocument();
});

test('refreshes right away when an action announces new alerts', async () => {
  api.listNotifications.mockResolvedValue({ results: [], unread_count: 0 });
  render(<NotificationBell />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalledTimes(1));

  api.listNotifications.mockResolvedValue(ALERTS);
  await act(async () => announceNotificationsChanged());

  expect(await screen.findByTestId('notification-dot')).toBeInTheDocument();
});
