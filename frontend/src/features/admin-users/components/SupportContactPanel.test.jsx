import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as api from 'api';
import SupportContactPanel from './SupportContactPanel';

jest.mock('api');

afterEach(() => jest.clearAllMocks());

const settings = {
  email_verification_required: false,
  support_email: 'support@gooddriver.example.com',
  support_phone: '',
};

test('loads and saves the support contact', async () => {
  api.getRegistrationSettings.mockResolvedValue(settings);
  api.updateRegistrationSettings.mockResolvedValue({
    ...settings,
    support_phone: '+18005550123',
  });
  render(<SupportContactPanel />);

  const email = screen.getByLabelText('Support email');
  await waitFor(() => expect(email).toHaveValue('support@gooddriver.example.com'));
  await userEvent.type(screen.getByLabelText('Support phone'), '800 555 0123');
  await userEvent.click(screen.getByRole('button', { name: 'Save contact' }));

  expect(await screen.findByRole('status')).toHaveTextContent('support contact was saved');
  expect(api.updateRegistrationSettings).toHaveBeenCalledWith({
    support_email: 'support@gooddriver.example.com',
    support_phone: '800 555 0123',
  });
  expect(screen.getByLabelText('Support phone')).toHaveValue('+18005550123');
});

test('shows field errors from the server next to the field', async () => {
  api.getRegistrationSettings.mockResolvedValue(settings);
  const error = new Error('Bad request');
  error.data = { support_phone: ['Enter a valid phone number.'] };
  api.updateRegistrationSettings.mockRejectedValue(error);
  render(<SupportContactPanel />);
  const save = screen.getByRole('button', { name: 'Save contact' });
  await waitFor(() => expect(save).toBeEnabled());

  await userEvent.click(save);

  expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument();
  expect(screen.getByLabelText('Support phone')).toHaveAttribute('aria-invalid', 'true');
});

test('a failed load disables the form and explains why', async () => {
  api.getRegistrationSettings.mockRejectedValue(new Error('Network error'));

  render(<SupportContactPanel />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  expect(screen.getByRole('button', { name: 'Save contact' })).toBeDisabled();
});
