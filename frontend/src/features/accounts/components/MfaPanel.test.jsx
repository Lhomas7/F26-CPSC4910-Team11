import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../../../api';
import MfaPanel from './MfaPanel';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

const notEnrolled = (overrides = {}) => ({
  required: false,
  enrolled: false,
  methods: [],
  default_method: 'email',
  allowed_methods: ['email', 'sms', 'totp'],
  backup_codes_remaining: 0,
  ...overrides,
});

test('shows a single set-up line for the default method when MFA is not enrolled', () => {
  render(<MfaPanel mfa={notEnrolled()} onRefreshed={jest.fn()} />);

  expect(screen.getByText('Not set up')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Set up 2FA' })).toBeInTheDocument();
  // Email is the default for drivers, so the other two methods aren't shown yet.
  expect(screen.queryByLabelText('Phone number (for text message codes)')).not.toBeInTheDocument();
});

test('starting the default method calls setup with that method', async () => {
  api.mfaSetup.mockResolvedValue({ method: 'email' });
  render(<MfaPanel mfa={notEnrolled()} onRefreshed={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Set up 2FA' }));

  await waitFor(() => expect(api.mfaSetup).toHaveBeenCalledWith('email', undefined));
});

test('admins only ever see the authenticator app as a setup option', () => {
  render(
    <MfaPanel
      mfa={notEnrolled({ default_method: 'totp', allowed_methods: ['totp'] })}
      onRefreshed={jest.fn()}
    />,
  );

  expect(screen.getByRole('button', { name: 'Set up 2FA' })).toBeInTheDocument();
  expect(screen.getByText(/authenticator app/i)).toBeInTheDocument();
  expect(screen.queryByText('Set up a different method instead')).not.toBeInTheDocument();
});

test('choosing a different method switches the setup flow to it', () => {
  render(<MfaPanel mfa={notEnrolled()} onRefreshed={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Set up a different method instead' }));
  fireEvent.change(screen.getByLabelText('Set up a different method instead'), {
    target: { value: 'sms' },
  });

  expect(screen.getByLabelText('Phone number (for text message codes)')).toBeInTheDocument();
});

test('formats a US phone number and submits normalized international form', async () => {
  api.mfaSetup.mockResolvedValue({ method: 'sms' });
  render(<MfaPanel mfa={notEnrolled({ default_method: 'sms' })} onRefreshed={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Phone number (for text message codes)'), {
    target: { value: '8645551234' },
  });
  expect(screen.getByLabelText('Phone number (for text message codes)')).toHaveValue(
    '(864) 555-1234',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turn on text message codes' }));
  await waitFor(() => expect(api.mfaSetup).toHaveBeenCalledWith('sms', '+18645551234'));
});

test('uses the selected country code and removes an international trunk zero', async () => {
  api.mfaSetup.mockResolvedValue({ method: 'sms' });
  render(<MfaPanel mfa={notEnrolled({ default_method: 'sms' })} onRefreshed={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'GB' } });
  fireEvent.change(screen.getByLabelText('Phone number (for text message codes)'), {
    target: { value: '02079460958' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Turn on text message codes' }));
  await waitFor(() => expect(api.mfaSetup).toHaveBeenCalledWith('sms', '+442079460958'));
});

test('rejects an incomplete phone number before calling the API', () => {
  render(<MfaPanel mfa={notEnrolled({ default_method: 'sms' })} onRefreshed={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Phone number (for text message codes)'), {
    target: { value: '555' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Turn on text message codes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid phone number');
  expect(api.mfaSetup).not.toHaveBeenCalled();
});

test('shows backup codes once, in a copyable box, after the first method is verified', async () => {
  api.mfaSetup.mockResolvedValue({ method: 'email' });
  api.mfaVerify.mockResolvedValue({
    detail: 'Email enabled.',
    backup_codes: Array.from({ length: 10 }, (_, i) => `CODE${i}`),
  });
  const onRefreshed = jest.fn();
  render(<MfaPanel mfa={notEnrolled()} onRefreshed={onRefreshed} />);

  fireEvent.click(screen.getByRole('button', { name: 'Set up 2FA' }));
  await screen.findByLabelText('Verification code');
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));

  expect(await screen.findByLabelText('Backup codes')).toBeInTheDocument();
  expect(screen.getByLabelText('Backup codes')).toHaveValue(
    Array.from({ length: 10 }, (_, i) => `CODE${i}`).join('\n'),
  );
  // Regression guard: a parent (e.g. the admin/sponsor setup wall) may unmount
  // this panel as soon as it sees MFA is enrolled, so the reveal must not be
  // reported to the parent until the user has acknowledged it.
  expect(onRefreshed).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Done — I saved these codes' }));
  expect(screen.queryByLabelText('Backup codes')).not.toBeInTheDocument();
  expect(onRefreshed).toHaveBeenCalled();
});

const enrolled = (overrides = {}) => ({
  required: false,
  enrolled: true,
  methods: ['email'],
  default_method: 'email',
  allowed_methods: ['email', 'sms', 'totp'],
  backup_codes_remaining: 7,
  ...overrides,
});

test('enrolled view only lists methods allowed for this account type', () => {
  render(
    <MfaPanel
      mfa={enrolled({ methods: ['totp'], allowed_methods: ['totp'] })}
      onRefreshed={jest.fn()}
    />,
  );

  expect(screen.getByText('Authenticator app')).toBeInTheDocument();
  expect(screen.queryByText('Email code')).not.toBeInTheDocument();
  expect(screen.queryByText('Text message')).not.toBeInTheDocument();
});

test('enrolled view shows remaining backup codes and regenerates with a password', async () => {
  api.mfaBackupCodesRegenerate.mockResolvedValue({ backup_codes: ['NEWCODE1', 'NEWCODE2'] });
  render(<MfaPanel mfa={enrolled()} onRefreshed={jest.fn()} />);

  expect(screen.getByText('7 unused codes remaining.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate codes' }));
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'MyPassword123!' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate codes' }));

  await waitFor(() => expect(api.mfaBackupCodesRegenerate).toHaveBeenCalledWith('MyPassword123!'));
  await waitFor(() =>
    expect(screen.getByLabelText('Backup codes')).toHaveValue('NEWCODE1\nNEWCODE2'),
  );
});
