import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import LoginPage from './LoginPage';

jest.mock('../../auth/AuthContext');
jest.mock('../../api');

beforeEach(() => {
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn: jest.fn(),
    signOut: jest.fn(),
    completeMfaLogin: jest.fn(),
    requestMfaLoginCode: jest.fn(),
  });
  api.registerDriver.mockResolvedValue({ username: 'jamie.rivera' });
});

afterEach(() => jest.clearAllMocks());

function renderLoginPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginPage />
    </MemoryRouter>,
  );
}

test('renders the animated truck structure in the road lane', () => {
  const { container } = renderLoginPage();

  expect(container.querySelector('.login-lane .road-truck-loop')).toBeInTheDocument();
  expect(container.querySelector('.road-truck .asset-semi-truck')).toBeInTheDocument();
});

test('the road truck crashes when a sign-in error appears', () => {
  const { container } = renderLoginPage();
  const truck = container.querySelector('.login-lane .road-truck');
  expect(truck).not.toHaveClass('road-truck-crashed');

  const signInButton = screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.getAttribute('type') === 'submit');
  fireEvent.click(signInButton);

  expect(screen.getByRole('alert')).toHaveTextContent('Enter your username.');
  expect(truck).toHaveClass('road-truck-crashed');
});

test('the road truck wrecks while the server is unreachable and recovers when it is back', async () => {
  jest.useFakeTimers();
  const outage = new TypeError('Failed to fetch');
  useAuth.mockReturnValue({ ...useAuth(), signIn: jest.fn().mockRejectedValue(outage) });
  api.isOutageError.mockImplementation((error) => error === outage);
  api.checkHealth.mockResolvedValue(true);

  const { container } = renderLoginPage();
  const truck = container.querySelector('.login-lane .road-truck');
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'driver.one' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.getAttribute('type') === 'submit'));

  expect(await screen.findByRole('alert')).toHaveTextContent("We can't reach the Good Driver server right now.");
  expect(truck).toHaveClass('road-truck-wrecked');

  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(api.checkHealth).toHaveBeenCalled();
  expect(truck).not.toHaveClass('road-truck-wrecked');
  jest.useRealTimers();
});

test('driver registration sends separate name and email fields', async () => {
  renderLoginPage();
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  fireEvent.click(screen.getByRole('button', { name: /Driver.*Earn points/i }));

  fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jamie' } });
  fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Rivera' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jamie@example.com' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'jamie.rivera' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'ExamplePassword123!' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Terms of Service/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Driver Account' }));

  await waitFor(() => {
    expect(api.registerDriver).toHaveBeenCalledWith({
      first_name: 'Jamie',
      last_name: 'Rivera',
      email: 'jamie@example.com',
      username: 'jamie.rivera',
      password: 'ExamplePassword123!',
      password_confirm: 'ExamplePassword123!',
      accepted_terms: true,
    });
  });
});

test('registration links to the terms and privacy notice without losing form state', () => {
  renderLoginPage();
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  fireEvent.click(screen.getByRole('button', { name: /Driver.*Earn points/i }));

  expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('target', '_blank');
  expect(screen.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute('href', '/privacy');
  expect(screen.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute('target', '_blank');
});

test('single-method MFA login stages, auto-requests the code, and shows the code entry screen', async () => {
  const signIn = jest.fn().mockResolvedValue({
    mfa: { required: false, enrolled: true, methods: ['email'] },
  });
  const requestMfaLoginCode = jest.fn().mockResolvedValue({ detail: 'Verification code sent.' });
  const completeMfaLogin = jest.fn().mockResolvedValue({ username: 'driver.one' });
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn,
    signOut: jest.fn(),
    completeMfaLogin,
    requestMfaLoginCode,
  });

  renderLoginPage();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'driver.one' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  const signInButton = screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.type === 'submit');
  fireEvent.click(signInButton);

  await waitFor(() => expect(signIn).toHaveBeenCalledWith('driver.one', 'ExamplePassword123!'));
  await waitFor(() => expect(requestMfaLoginCode).toHaveBeenCalledWith('email'));
  expect(await screen.findByText('Two-step verification')).toBeInTheDocument();
  expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verify and sign in' })).toBeInTheDocument();
});

test('offers a backup code option and completes login with one when available', async () => {
  const signIn = jest.fn().mockResolvedValue({
    mfa: { required: true, enrolled: true, methods: ['totp'], backup_codes_remaining: 3 },
  });
  const completeMfaLogin = jest.fn().mockResolvedValue({ username: 'admin.one' });
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn,
    signOut: jest.fn(),
    completeMfaLogin,
    requestMfaLoginCode: jest.fn(),
  });

  renderLoginPage();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin.one' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  const signInButton = screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.type === 'submit');
  fireEvent.click(signInButton);

  await waitFor(() => expect(signIn).toHaveBeenCalledWith('admin.one', 'ExamplePassword123!'));
  expect(await screen.findByText('Two-step verification')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Use a backup code instead' }));
  expect(screen.getByLabelText('Backup code')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'ABCDE12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

  await waitFor(() => expect(completeMfaLogin).toHaveBeenCalledWith('backup', 'ABCDE12345'));
});

test('does not offer a backup code option when none remain', async () => {
  const signIn = jest.fn().mockResolvedValue({
    mfa: { required: false, enrolled: true, methods: ['email'] },
  });
  useAuth.mockReturnValue({
    loading: false,
    user: null,
    signIn,
    signOut: jest.fn(),
    completeMfaLogin: jest.fn(),
    requestMfaLoginCode: jest.fn().mockResolvedValue({ detail: 'sent' }),
  });

  renderLoginPage();
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'driver.one' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ExamplePassword123!' } });
  const signInButton = screen.getAllByRole('button', { name: 'Sign In' })
    .find((button) => button.type === 'submit');
  fireEvent.click(signInButton);

  expect(await screen.findByText('Two-step verification')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use a backup code instead' })).not.toBeInTheDocument();
});

test('shows and hides the sign-in password without changing its value', () => {
  renderLoginPage();
  const password = screen.getByLabelText('Password');
  fireEvent.change(password, { target: { value: 'ExamplePassword123!' } });
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(password).toHaveValue('ExamplePassword123!');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(password).toHaveAttribute('type', 'password');
});

test('provides independent password visibility controls during registration', () => {
  renderLoginPage();
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  fireEvent.click(screen.getByRole('button', { name: /Driver.*Earn points/i }));
  const password = screen.getByLabelText('Password');
  const confirmation = screen.getByLabelText('Confirm Password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(confirmation).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));
  expect(confirmation).toHaveAttribute('type', 'text');
});

test('sign in form links to the forgot password page', () => {
  renderLoginPage();

  expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
});

test('a signed-in user is redirected to the welcome page', async () => {
  useAuth.mockReturnValue({
    loading: false,
    user: { username: 'jamie.rivera', account_type: 'driver', name: 'Jamie Rivera' },
    signIn: jest.fn(),
    signOut: jest.fn(),
    completeMfaLogin: jest.fn(),
    requestMfaLoginCode: jest.fn(),
  });

  render(
    <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Welcome</div>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText('Welcome')).toBeInTheDocument();
});
