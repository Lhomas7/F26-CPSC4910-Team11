import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import WelcomePage from './WelcomePage';

jest.mock('../../auth/AuthContext');

beforeEach(() => {
  useAuth.mockReturnValue({ user: null });
});

afterEach(() => jest.clearAllMocks());

function renderWelcomePage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WelcomePage />
    </MemoryRouter>,
  );
}

test('renders the welcome copy and anonymous CTAs', () => {
  renderWelcomePage();

  expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/login?tab=register');
  expect(screen.queryByRole('link', { name: 'Go to drivers' })).not.toBeInTheDocument();
});

test('greets a signed-in user by name', () => {
  useAuth.mockReturnValue({
    user: { name: 'Jamie Rivera', username: 'jamie.rivera', account_type: 'driver' },
  });
  renderWelcomePage();

  expect(screen.getByRole('heading', { level: 2, name: 'Welcome back, Jamie Rivera' })).toBeInTheDocument();
});

test('a sponsor gets the Go to drivers shortcut plus My account', () => {
  useAuth.mockReturnValue({
    user: { name: 'Ava Chen', username: 'ava.chen', account_type: 'sponsor' },
  });
  renderWelcomePage();

  expect(screen.getByRole('link', { name: 'Go to drivers' })).toHaveAttribute('href', '/drivers');
  expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account');
});

test('a non-sponsor only gets My account, with no drivers shortcut', () => {
  useAuth.mockReturnValue({
    user: { name: 'Jamie Rivera', username: 'jamie.rivera', account_type: 'driver' },
  });
  renderWelcomePage();

  expect(screen.queryByRole('link', { name: 'Go to drivers' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/account');
});
