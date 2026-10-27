import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import * as api from '../../../api';
import { useAuth } from '../../../auth/AuthContext';
import DriverAlertsPanel from './DriverAlertsPanel';

jest.mock('../../../api');
jest.mock('../../../auth/AuthContext');

const settings = {
  points_added_enabled: true,
  points_removed_enabled: false,
  email_enabled: true,
  sms_enabled: false,
  always_on: ['sponsor_dropped', 'security'],
};

function renderPanel() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DriverAlertsPanel driverId={7} driverName="Jamie Rivera" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  api.getDriverAlerts.mockResolvedValue({ on_points_added: false, on_points_removed: false });
  api.getDriverAlertSettings.mockResolvedValue(settings);
});

afterEach(() => jest.clearAllMocks());

test('turns on point-gain alerts for this driver', async () => {
  api.updateDriverAlerts.mockResolvedValue({ on_points_added: true, on_points_removed: false });
  renderPanel();

  const gains = screen.getByRole('checkbox', { name: 'Jamie Rivera gains points' });
  await waitFor(() => expect(gains).toBeEnabled());
  fireEvent.click(gains);

  expect(await screen.findByRole('status')).toHaveTextContent(
    'You will be alerted when they gain points.',
  );
  expect(api.updateDriverAlerts).toHaveBeenCalledWith(7, { on_points_added: true });
  expect(gains).toBeChecked();
});

test('reverts the toggle when saving fails', async () => {
  api.updateDriverAlerts.mockRejectedValue(new Error('Could not save'));
  renderPanel();

  const losses = screen.getByRole('checkbox', { name: 'Jamie Rivera loses points' });
  await waitFor(() => expect(losses).toBeEnabled());
  fireEvent.click(losses);

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(losses).not.toBeChecked();
});

test("shows the driver's own alert settings read-only", async () => {
  renderPanel();

  const section = screen.getByRole('region', { name: "Jamie Rivera's alert settings" });
  expect(await within(section).findByText('Driver gets: Points added')).toBeInTheDocument();
  const terms = within(section).getAllByRole('term');
  const values = within(section).getAllByRole('definition');
  const value = (label) =>
    values[terms.findIndex((term) => term.textContent === `Driver gets: ${label}`)];
  expect(value('Points added')).toHaveTextContent('On');
  expect(value('Points removed')).toHaveTextContent('Off');
  expect(value('Dropped by or added to a sponsor')).toHaveTextContent('Always on');
  expect(within(section).queryByRole('checkbox')).not.toBeInTheDocument();
});

test('alert choices cannot be changed during View-as', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor', impersonation: { active: true } } });
  renderPanel();

  await waitFor(() => expect(api.getDriverAlerts).toHaveBeenCalled());
  expect(screen.getByRole('checkbox', { name: 'Jamie Rivera gains points' })).toBeDisabled();
});
