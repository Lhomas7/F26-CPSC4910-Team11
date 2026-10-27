import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../../../api';
import SponsorNotificationsPanel from './SponsorNotificationsPanel';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

test('email for driver alerts is off by default and can be turned on', async () => {
  api.getSponsorNotificationPreferences.mockResolvedValue({ email_enabled: false });
  api.updateSponsorNotificationPreferences.mockResolvedValue({ email_enabled: true });
  render(<SponsorNotificationsPanel />);

  const email = screen.getByRole('checkbox', { name: 'Also email me' });
  await waitFor(() => expect(email).toBeEnabled());
  expect(email).not.toBeChecked();
  fireEvent.click(email);

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Driver alerts will be emailed to you.',
  );
  expect(api.updateSponsorNotificationPreferences).toHaveBeenCalledWith({ email_enabled: true });
  expect(email).toBeChecked();
});
