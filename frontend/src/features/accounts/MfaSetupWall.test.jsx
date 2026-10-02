import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import MfaSetupWall from './MfaSetupWall';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

afterEach(() => jest.clearAllMocks());

test('stays open to show backup codes after enrolling, and closes once acknowledged', async () => {
  useAuth.mockReturnValue({
    user: { account_type: 'admin', mfa: { required: true, enrolled: false } },
    updateUser: jest.fn(),
  });
  api.mfaStatus
    .mockResolvedValueOnce({
      mfa: {
        required: true,
        enrolled: false,
        methods: [],
        default_method: 'totp',
        allowed_methods: ['totp'],
        backup_codes_remaining: 0,
      },
    })
    .mockResolvedValueOnce({
      mfa: {
        required: true,
        enrolled: true,
        methods: ['totp'],
        default_method: 'totp',
        allowed_methods: ['totp'],
        backup_codes_remaining: 10,
      },
    });
  api.mfaSetup.mockResolvedValue({ qr_code: 'data:image/png;base64,abc', manual_key: 'SECRET123' });
  api.mfaVerify.mockResolvedValue({
    detail: 'TOTP enabled.',
    backup_codes: Array.from({ length: 10 }, (_, i) => `CODE${i}`),
  });

  render(<MfaSetupWall />);

  expect(await screen.findByRole('heading', { name: 'Finish setting up your administrator account' }))
    .toBeInTheDocument();

  fireEvent.click(await screen.findByRole('button', { name: 'Set up 2FA' }));
  fireEvent.change(await screen.findByLabelText('Enter a code from your authenticator app'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enable' }));

  // Regression guard: this used to unmount the whole wall (and the reveal
  // with it) the instant MFA became enrolled, before the codes were shown.
  await waitFor(() => expect(screen.getByLabelText('Backup codes')).toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'Finish setting up your administrator account' }))
    .toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: "Done — I saved these codes" }));

  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Finish setting up your administrator account' }))
      .not.toBeInTheDocument();
  });
});
