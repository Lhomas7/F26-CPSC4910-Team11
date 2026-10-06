import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import AccountPage from './AccountPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

const profile = { id: 7, username: 'driver.one', email: 'driver@example.com', phone_number: '', name: 'Driver One', account_type: 'driver', company: 'Palmetto Freight', avatar_url: null };

beforeEach(() => {
  useAuth.mockReturnValue({ updateUser: jest.fn() });
  api.getProfile.mockResolvedValue(profile);
  api.updateProfile.mockResolvedValue(profile);
  api.getLoginAttempts.mockResolvedValue({ recent: [], last_24_hours: [] });
});

afterEach(() => jest.clearAllMocks());

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:profile-preview');
  URL.revokeObjectURL = jest.fn();
});

test('loads and displays the authenticated profile', async () => {
  render(<AccountPage />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading your profile');
  expect(await screen.findByText('Driver One')).toBeInTheDocument();
  expect(screen.getByText('@driver.one')).toBeInTheDocument();
  expect(screen.getByText('Palmetto Freight')).toBeInTheDocument();
});

test('edits and saves profile fields while keeping locked fields read-only', async () => {
  const updateUser = jest.fn();
  useAuth.mockReturnValue({ updateUser });
  api.updateProfile.mockResolvedValue({ ...profile, name: 'Updated Driver' });
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Updated Driver' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Updated Driver', username: 'driver.one', email: 'driver@example.com', phone_number: '' }));
  expect(await screen.findByText(/Profile saved/)).toBeInTheDocument();
  expect(updateUser).toHaveBeenCalledWith({ ...profile, name: 'Updated Driver' });
  expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
});

test('cancel discards unsaved profile edits', async () => {
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Unsaved Name' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Driver One')).toBeInTheDocument();
  expect(screen.queryByText('Unsaved Name')).not.toBeInTheDocument();
  expect(api.updateProfile).not.toHaveBeenCalled();
});

test('shows server validation errors without discarding edits', async () => {
  api.updateProfile.mockRejectedValue({ message: 'Invalid profile.', data: { username: ['A user with this username already exists.'] } });
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'existing.user' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  expect(screen.getByLabelText('Username')).toHaveValue('existing.user');
});

test('rejects an invalid username before sending an update', async () => {
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'not a username' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('3 to 30 characters');
  expect(api.updateProfile).not.toHaveBeenCalled();
});

test('can retry after the profile fails to load', async () => {
  api.getProfile.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(profile);
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Driver One')).toBeInTheDocument();
  expect(api.getProfile).toHaveBeenCalledTimes(2);
});

test('selects and uploads a valid driver profile picture', async () => {
  const picture = new File(['picture'], 'driver.png', { type: 'image/png' });
  api.updateProfile.mockResolvedValue({ ...profile, avatar_url: 'http://localhost:8000/media/driver.png' });
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Choose picture'), { target: { files: [picture] } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({
    name: 'Driver One',
    username: 'driver.one',
    email: 'driver@example.com',
    phone_number: '',
    profile_picture: picture,
  }));
});

test('rejects an unsupported profile picture before upload', async () => {
  const picture = new File(['not-an-image'], 'driver.gif', { type: 'image/gif' });
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Choose picture'), { target: { files: [picture] } });
  expect(screen.getByRole('alert')).toHaveTextContent('JPG, PNG, or WebP');
  expect(api.updateProfile).not.toHaveBeenCalled();
});

test('reuses the profile page for an administrator account', async () => {
  const adminProfile = {
    id: 1,
    username: 'team11.admin',
    email: 'admin@example.com',
    name: 'Team Administrator',
    account_type: 'admin',
    company: null,
    avatar_url: null,
  };
  api.getProfile.mockResolvedValue(adminProfile);
  render(<AccountPage />);

  expect(await screen.findByText('Team Administrator')).toBeInTheDocument();
  expect(screen.getByText('Admin')).toBeInTheDocument();
  expect(screen.getByText('Not applicable')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
  expect(screen.getByLabelText('Choose picture')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveValue('admin@example.com');
});

test('lets a driver update their phone number', async () => {
  api.updateProfile.mockResolvedValue({ ...profile, phone_number: '+18645550101' });
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '(864) 555-0101' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
    email: 'driver@example.com',
    phone_number: '(864) 555-0101',
  })));
  expect(await screen.findByText('+18645550101')).toBeInTheDocument();
});

test('lets a driver clear their phone number', async () => {
  const profileWithPhone = { ...profile, phone_number: '+18645550101' };
  api.getProfile.mockResolvedValue(profileWithPhone);
  api.updateProfile.mockResolvedValue(profile);
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
    phone_number: '',
  })));
  expect(await screen.findByText('Not provided')).toBeInTheDocument();
});

test('rejects an invalid phone number before sending an update', async () => {
  render(<AccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '555-12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(screen.getByRole('alert')).toHaveTextContent('valid phone number');
  expect(api.updateProfile).not.toHaveBeenCalled();
});

test('uploads a profile picture for an administrator', async () => {
  const adminProfile = { ...profile, id: 1, username: 'team11.admin', email: 'admin@example.com', name: 'Team Administrator', account_type: 'admin', company: null };
  const picture = new File(['picture'], 'admin.png', { type: 'image/png' });
  api.getProfile.mockResolvedValue(adminProfile);
  api.updateProfile.mockResolvedValue({ ...adminProfile, avatar_url: 'http://localhost:8000/media/admin.png' });
  render(<AccountPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText('Choose picture'), { target: { files: [picture] } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({
    name: 'Team Administrator',
    username: 'team11.admin',
    email: 'admin@example.com',
    profile_picture: picture,
  }));
});

test.each(['sponsor', 'admin'])('shows recent sign-in activity to %s accounts', async (accountType) => {
  api.getProfile.mockResolvedValue({ ...profile, account_type: accountType });
  render(<AccountPage />);
  expect(await screen.findByRole('heading', { name: 'Recent sign-in activity' })).toBeInTheDocument();
  expect(api.getLoginAttempts).toHaveBeenCalled();
});

test('does not show sign-in activity to drivers', async () => {
  render(<AccountPage />);
  expect(await screen.findByText('Driver One')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Recent sign-in activity' })).not.toBeInTheDocument();
  expect(api.getLoginAttempts).not.toHaveBeenCalled();
});
