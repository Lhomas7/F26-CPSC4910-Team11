import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../../../api';
import RegistrationSettingsPanel from './RegistrationSettingsPanel';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

const toggleLabel = /Require email verification/i;

test('loads the current setting into the switch', async () => {
  api.getRegistrationSettings.mockResolvedValue({ email_verification_required: true });

  render(<RegistrationSettingsPanel />);

  expect(screen.getByRole('checkbox', { name: toggleLabel })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole('checkbox', { name: toggleLabel })).toBeEnabled());
  expect(screen.getByRole('checkbox', { name: toggleLabel })).toBeChecked();
});

test('turning the switch on saves the setting and confirms it', async () => {
  api.getRegistrationSettings.mockResolvedValue({ email_verification_required: false });
  api.updateRegistrationSettings.mockResolvedValue({ email_verification_required: true });
  render(<RegistrationSettingsPanel />);
  const toggle = screen.getByRole('checkbox', { name: toggleLabel });
  await waitFor(() => expect(toggle).toBeEnabled());

  fireEvent.click(toggle);

  expect(await screen.findByRole('status')).toHaveTextContent(/must now verify their email/i);
  expect(api.updateRegistrationSettings).toHaveBeenCalledWith({ email_verification_required: true });
  expect(toggle).toBeChecked();
});

test('a failed save reverts the switch and shows the error', async () => {
  api.getRegistrationSettings.mockResolvedValue({ email_verification_required: false });
  api.updateRegistrationSettings.mockRejectedValue(new Error('You do not have permission to perform this action.'));
  render(<RegistrationSettingsPanel />);
  const toggle = screen.getByRole('checkbox', { name: toggleLabel });
  await waitFor(() => expect(toggle).toBeEnabled());

  fireEvent.click(toggle);

  expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission');
  expect(toggle).not.toBeChecked();
});

test('a failed load leaves the switch disabled and explains why', async () => {
  api.getRegistrationSettings.mockRejectedValue(new Error('Network error'));

  render(<RegistrationSettingsPanel />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  expect(screen.getByRole('checkbox', { name: toggleLabel })).toBeDisabled();
});
