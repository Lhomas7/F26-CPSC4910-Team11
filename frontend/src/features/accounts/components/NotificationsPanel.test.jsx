import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../../../api';
import NotificationsPanel from './NotificationsPanel';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

const defaults = {
  points_added_enabled: true,
  points_removed_enabled: true,
  email_enabled: true,
  sms_enabled: false,
  sms_available: true,
};

const checkbox = (name) => screen.getByRole('checkbox', { name });

async function renderLoaded(props = { phoneNumber: '+18645550100' }) {
  render(<NotificationsPanel {...props} />);
  await waitFor(() => expect(checkbox('When points are added')).toBeEnabled());
}

test('loads the saved settings with point alerts and email on by default', async () => {
  api.getNotificationPreferences.mockResolvedValue(defaults);

  render(<NotificationsPanel phoneNumber="+18645550100" />);

  expect(checkbox('When points are added')).toBeDisabled();
  await waitFor(() => expect(checkbox('When points are added')).toBeEnabled());
  expect(checkbox('When points are added')).toBeChecked();
  expect(checkbox('When points are removed')).toBeChecked();
  expect(checkbox('Email alerts')).toBeChecked();
  expect(checkbox('Text message alerts')).not.toBeChecked();
  expect(checkbox('Text message alerts')).toBeEnabled();
});

test('turning off points-removed alerts saves only that setting', async () => {
  api.getNotificationPreferences.mockResolvedValue(defaults);
  api.updateNotificationPreferences.mockResolvedValue({
    ...defaults,
    points_removed_enabled: false,
  });
  await renderLoaded();

  fireEvent.click(checkbox('When points are removed'));

  expect(await screen.findByRole('status')).toHaveTextContent('Points-removed alerts are off.');
  expect(api.updateNotificationPreferences).toHaveBeenCalledWith({
    points_removed_enabled: false,
  });
  expect(checkbox('When points are removed')).not.toBeChecked();
  expect(checkbox('When points are added')).toBeChecked();
});

test('turning on text alerts saves the delivery choice', async () => {
  api.getNotificationPreferences.mockResolvedValue(defaults);
  api.updateNotificationPreferences.mockResolvedValue({ ...defaults, sms_enabled: true });
  await renderLoaded();

  fireEvent.click(checkbox('Text message alerts'));

  expect(await screen.findByRole('status')).toHaveTextContent('texted to you');
  expect(api.updateNotificationPreferences).toHaveBeenCalledWith({ sms_enabled: true });
  expect(checkbox('Text message alerts')).toBeChecked();
});

test('a failed save reverts the checkbox and shows the error', async () => {
  api.getNotificationPreferences.mockResolvedValue(defaults);
  api.updateNotificationPreferences.mockRejectedValue(new Error('Network error'));
  await renderLoaded();

  fireEvent.click(checkbox('When points are added'));

  expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  expect(checkbox('When points are added')).toBeChecked();
});

test('text alerts are unavailable without a phone number', async () => {
  api.getNotificationPreferences.mockResolvedValue({ ...defaults, sms_enabled: true });

  await renderLoaded({ phoneNumber: '' });

  expect(checkbox('Text message alerts')).toBeDisabled();
  expect(checkbox('Text message alerts')).not.toBeChecked();
  expect(screen.getByText(/Add a phone number to your profile/)).toBeInTheDocument();
});

test('a failed load leaves the settings disabled and explains why', async () => {
  api.getNotificationPreferences.mockRejectedValue(new Error('Network error'));

  render(<NotificationsPanel phoneNumber="" />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  expect(checkbox('Email alerts')).toBeDisabled();
});

test('explains which alerts are always sent', async () => {
  api.getNotificationPreferences.mockResolvedValue(defaults);
  await renderLoaded();

  expect(
    screen.getByText(/being added to or dropped by a sponsor are always sent/),
  ).toBeInTheDocument();
});
