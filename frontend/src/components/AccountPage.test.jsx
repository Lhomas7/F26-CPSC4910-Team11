import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAuth } from '../auth/AuthContext';
import * as api from '../config/api';
import AccountPage from './AccountPage';

jest.mock('../auth/AuthContext');
jest.mock('../config/api');

const profile = { id: 7, username: 'driver.one', name: 'Driver One', account_type: 'driver', company: 'Palmetto Freight', avatar_url: null };

beforeEach(() => {
  useAuth.mockReturnValue({ updateUser: jest.fn() });
  api.getProfile.mockResolvedValue(profile);
  api.updateProfile.mockResolvedValue(profile);
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
  await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Updated Driver', username: 'driver.one' }));
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
  expect(screen.queryByLabelText('Choose picture')).not.toBeInTheDocument();
});
