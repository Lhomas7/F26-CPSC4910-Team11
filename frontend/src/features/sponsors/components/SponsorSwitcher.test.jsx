import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import * as api from 'api';
import { AppLayout } from 'app/AppLayout';
import { useAuth } from 'auth/AuthContext';

jest.mock('api');
jest.mock('auth/AuthContext');
jest.mock('app/NotificationBell', () => () => null);
jest.mock('features/cart/CartButton', () => () => null);

const DRIVER = { id: 4, username: 'jamie.rivera', name: 'Jamie Rivera', account_type: 'driver' };
const alpha = { id: 3, name: 'Alpha Freight' };
const beta = { id: 5, name: 'Beta Haulers' };
const mounts = jest.fn();

function PageProbe() {
  useEffect(() => mounts(), []);
  return <p>Sponsor page</p>;
}

function sponsorsPayload(activeId, memberships) {
  return { active_sponsor_id: activeId, memberships };
}

const BOTH_APPROVED = [
  { sponsor: alpha, status: 'approved', point_balance: 50 },
  { sponsor: beta, status: 'approved', point_balance: 900 },
];

function renderLayout() {
  useAuth.mockReturnValue({ user: DRIVER, signOut: jest.fn(), stopImpersonation: jest.fn() });
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<PageProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getCart.mockResolvedValue({
    results: [],
    item_count: 0,
    total_points: 0,
    point_balance: 50,
    sponsor: alpha,
  });
});

afterEach(() => jest.clearAllMocks());

test('a driver with one approved sponsor sees it named, with nothing to switch', async () => {
  api.getMySponsors.mockResolvedValue(
    sponsorsPayload(alpha.id, [
      { sponsor: alpha, status: 'approved', point_balance: 50 },
      { sponsor: beta, status: 'pending' },
    ]),
  );
  renderLayout();

  expect(await screen.findByText('Alpha Freight')).toBeInTheDocument();
  expect(screen.getByText('Shopping with')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Shopping with sponsor' })).not.toBeInTheDocument();
});

test('a driver without an approved sponsor gets no switcher', async () => {
  api.getMySponsors.mockResolvedValue(
    sponsorsPayload(null, [{ sponsor: beta, status: 'pending' }]),
  );
  renderLayout();

  await waitFor(() => expect(api.getMySponsors).toHaveBeenCalled());
  expect(screen.queryByText('Shopping with')).not.toBeInTheDocument();
});

test('switching sponsors reloads the page and the cart for the chosen sponsor', async () => {
  api.getMySponsors.mockResolvedValue(sponsorsPayload(alpha.id, BOTH_APPROVED));
  api.setActiveSponsor.mockResolvedValue(sponsorsPayload(beta.id, BOTH_APPROVED));
  renderLayout();

  const trigger = await screen.findByRole('button', { name: 'Shopping with sponsor' });
  expect(trigger).toHaveTextContent('Alpha Freight');
  await waitFor(() => expect(api.getCart).toHaveBeenCalledTimes(1));
  expect(mounts).toHaveBeenCalledTimes(1);

  userEvent.click(trigger);
  userEvent.click(screen.getByRole('option', { name: /Beta Haulers/ }));

  expect(api.setActiveSponsor).toHaveBeenCalledWith(beta.id);
  await waitFor(() => expect(trigger).toHaveTextContent('Beta Haulers'));
  expect(await screen.findByText('Now using Beta Haulers.')).toBeInTheDocument();
  await waitFor(() => expect(mounts).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(api.getCart).toHaveBeenCalledTimes(2));
});

test('the menu shows each sponsor with its own balance', async () => {
  api.getMySponsors.mockResolvedValue(sponsorsPayload(alpha.id, BOTH_APPROVED));
  renderLayout();

  userEvent.click(await screen.findByRole('button', { name: 'Shopping with sponsor' }));

  expect(screen.getByRole('option', { name: /Alpha Freight\s*50 pts/ })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: /Beta Haulers\s*900 pts/ })).toBeInTheDocument();
});

test('a refused switch keeps the current sponsor and explains why', async () => {
  api.getMySponsors.mockResolvedValue(sponsorsPayload(alpha.id, BOTH_APPROVED));
  api.setActiveSponsor.mockRejectedValue(
    new Error('You can only switch to a sponsor that has approved you.'),
  );
  renderLayout();

  const trigger = await screen.findByRole('button', { name: 'Shopping with sponsor' });
  userEvent.click(trigger);
  userEvent.click(screen.getByRole('option', { name: /Beta Haulers/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'You can only switch to a sponsor that has approved you.',
  );
  expect(trigger).toHaveTextContent('Alpha Freight');
  expect(mounts).toHaveBeenCalledTimes(1);
});
