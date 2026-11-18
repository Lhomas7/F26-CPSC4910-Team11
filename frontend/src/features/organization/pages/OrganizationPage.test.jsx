import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as api from 'api';
import { ApiError } from 'api';
import { useAuth } from 'auth/AuthContext';
import OrganizationPage from './OrganizationPage';

jest.mock('api', () => ({
  ...jest.requireActual('api/client'),
  getOrganization: jest.fn(),
  updateOrganization: jest.fn(),
  getTeam: jest.fn(),
  setTeamMemberActive: jest.fn(),
}));
jest.mock('auth/AuthContext');

const organization = {
  id: 1,
  name: 'Palmetto Freight',
  description: 'We haul produce.',
  website: 'https://palmetto.example.com',
  contact_email: 'hello@palmetto.example.com',
  contact_phone: '+18645550100',
};
const team = [
  {
    id: 1,
    name: 'Dana Whitfield',
    username: 'dana',
    email: 'd@x.com',
    is_active: true,
    is_self: true,
  },
  { id: 2, name: 'Lee Former', username: 'lee', email: 'l@x.com', is_active: true, is_self: false },
];

afterEach(() => jest.resetAllMocks());

describe('as a sponsor', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
    api.getOrganization.mockResolvedValue(organization);
    api.getTeam.mockResolvedValue(team);
  });

  test('saves updated organization details', async () => {
    api.updateOrganization.mockResolvedValue({ ...organization, description: 'New text' });
    render(<OrganizationPage />);

    const about = await screen.findByLabelText('About your program');
    await userEvent.clear(about);
    await userEvent.type(about, 'New text');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    await waitFor(() =>
      expect(api.updateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'New text', name: 'Palmetto Freight' }),
      ),
    );
    expect(await screen.findByText(/details were saved/)).toBeInTheDocument();
  });

  test('shows server validation errors next to the field', async () => {
    api.updateOrganization.mockRejectedValue(
      new ApiError('Enter a website address', 400, { website: ['Enter a valid URL.'] }),
    );
    render(<OrganizationPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Save details' }));

    expect(await screen.findByText('Enter a valid URL.')).toBeInTheDocument();
    expect(screen.getByLabelText('Website')).toHaveAttribute('aria-invalid', 'true');
  });

  test('deactivates a teammate after confirming the password', async () => {
    api.setTeamMemberActive.mockResolvedValue({ ...team[1], is_active: false });
    render(<OrganizationPage />);

    expect(await screen.findByText('This is you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Lee Former' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Your current password'), 'secret-pass');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));

    await waitFor(() =>
      expect(api.setTeamMemberActive).toHaveBeenCalledWith(2, false, 'secret-pass'),
    );
    expect(await screen.findByText('Lee Former can no longer sign in.')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate Lee Former' })).toBeInTheDocument();
  });
});

describe('as a driver', () => {
  beforeEach(() => useAuth.mockReturnValue({ user: { account_type: 'driver' } }));

  test('shows the sponsor details read-only', async () => {
    api.getOrganization.mockResolvedValue(organization);
    render(<OrganizationPage />);

    expect(await screen.findByRole('heading', { name: 'Palmetto Freight' })).toBeInTheDocument();
    expect(screen.getByText('We haul produce.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'hello@palmetto.example.com' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save details' })).not.toBeInTheDocument();
    expect(api.getTeam).not.toHaveBeenCalled();
  });

  test('explains when there is no sponsor yet', async () => {
    api.getOrganization.mockRejectedValue(new ApiError('You are not linked yet.', 404, {}));
    render(<OrganizationPage />);

    expect(await screen.findByText('You are not linked yet.')).toBeInTheDocument();
  });
});
