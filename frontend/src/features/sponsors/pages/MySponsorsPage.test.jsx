import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import * as api from 'api';
import { ApiError } from 'api/client';
import { useAuth } from 'auth/AuthContext';
import { ActiveSponsorProvider } from '../ActiveSponsorContext';
import MySponsorsPage from './MySponsorsPage';

jest.mock('api');
jest.mock('auth/AuthContext');

const alpha = { id: 3, name: 'Alpha Freight' };
const beta = { id: 5, name: 'Beta Haulers' };
const coastal = { id: 7, name: 'Coastal Carriers' };
const delta = { id: 9, name: 'Delta Lines' };

const MEMBERSHIPS = [
  { sponsor: alpha, status: 'approved', point_balance: 50 },
  { sponsor: beta, status: 'approved', point_balance: 900 },
  { sponsor: coastal, status: 'pending' },
  { sponsor: delta, status: 'rejected' },
];

function renderPage({ viewingAs = false } = {}) {
  useAuth.mockReturnValue({
    user: { account_type: 'driver', impersonation: viewingAs ? { active: true } : undefined },
  });
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ActiveSponsorProvider>
        <MySponsorsPage />
      </ActiveSponsorProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getMySponsors.mockResolvedValue({ active_sponsor_id: alpha.id, memberships: MEMBERSHIPS });
  api.getPublicSponsors.mockResolvedValue([
    alpha,
    beta,
    coastal,
    delta,
    { id: 11, name: 'Eagle Transport' },
  ]);
});

afterEach(() => jest.clearAllMocks());

function sponsorRow(name) {
  return screen.getByText(name, { selector: 'strong' }).closest('li');
}

test('lists each sponsor with its status, and a balance only once approved', async () => {
  renderPage();

  await screen.findByText('Alpha Freight', { selector: 'strong' });
  expect(sponsorRow('Alpha Freight')).toHaveTextContent('Approved50 ptsShopping now');
  expect(sponsorRow('Beta Haulers')).toHaveTextContent('900 pts');
  expect(sponsorRow('Coastal Carriers')).toHaveTextContent('Pending approval');
  expect(sponsorRow('Coastal Carriers')).not.toHaveTextContent('pts');
  expect(sponsorRow('Delta Lines')).toHaveTextContent('Not approved');
});

test('offers only sponsors without an active membership, including rejected ones', async () => {
  renderPage();

  const form = await screen.findByRole('group', { name: 'Sponsors' });
  expect(within(form).getAllByRole('checkbox')).toHaveLength(2);
  expect(within(form).getByRole('checkbox', { name: 'Delta Lines' })).toBeInTheDocument();
  expect(within(form).getByRole('checkbox', { name: 'Eagle Transport' })).toBeInTheDocument();
});

test('applying sends the checked sponsors and shows them as pending', async () => {
  api.applyToSponsors.mockResolvedValue({
    active_sponsor_id: alpha.id,
    memberships: [
      ...MEMBERSHIPS.slice(0, 3),
      { sponsor: delta, status: 'pending' },
      { sponsor: { id: 11, name: 'Eagle Transport' }, status: 'pending' },
    ],
  });
  renderPage();

  userEvent.click(await screen.findByRole('checkbox', { name: 'Delta Lines' }));
  userEvent.click(screen.getByRole('checkbox', { name: 'Eagle Transport' }));
  userEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(api.applyToSponsors).toHaveBeenCalledWith([delta.id, 11]);
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Application sent to Delta Lines, Eagle Transport.',
  );
  expect(sponsorRow('Eagle Transport')).toHaveTextContent('Pending approval');
  expect(sponsorRow('Delta Lines')).toHaveTextContent('Pending approval');
});

test('a refused application shows each sponsor the server named', async () => {
  api.applyToSponsors.mockRejectedValue(
    new ApiError('Bad request', 400, {
      sponsor_ids: { 9: 'You already have an active application or membership with Delta Lines.' },
    }),
  );
  renderPage();

  userEvent.click(await screen.findByRole('checkbox', { name: 'Delta Lines' }));
  userEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'You already have an active application or membership with Delta Lines.',
  );
});

test('an administrator viewing as the driver cannot apply for them', async () => {
  renderPage({ viewingAs: true });

  expect(await screen.findByText(/viewing as this driver/i)).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Delta Lines' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
});

test('another approved sponsor can be chosen from the list', async () => {
  api.setActiveSponsor.mockResolvedValue({ active_sponsor_id: beta.id, memberships: MEMBERSHIPS });
  renderPage();

  await screen.findByText('Beta Haulers', { selector: 'strong' });
  userEvent.click(
    within(sponsorRow('Beta Haulers')).getByRole('button', { name: 'Shop with this sponsor' }),
  );

  expect(api.setActiveSponsor).toHaveBeenCalledWith(beta.id);
  await waitFor(() => expect(sponsorRow('Beta Haulers')).toHaveTextContent('Shopping now'));
  expect(within(sponsorRow('Alpha Freight')).getByRole('button')).toBeInTheDocument();
});
