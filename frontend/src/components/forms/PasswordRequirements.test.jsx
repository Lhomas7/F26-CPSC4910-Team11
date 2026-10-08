import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as api from '../../api';
import PasswordRequirements from './PasswordRequirements';

jest.mock('../../api');

const POLICY = {
  requirements: ['At least 12 characters', 'At least 2 numbers'],
  special_characters: '!@#',
};

function renderInField() {
  return render(
    <div data-testid="password-field">
      <label htmlFor="pw">Password</label>
      <input id="pw" />
      <PasswordRequirements />
    </div>,
  );
}

async function open(toggle) {
  userEvent.click(toggle);
}

beforeEach(() => {
  api.passwordPolicy.mockResolvedValue(POLICY);
});

test('requirements stay hidden until the toggle is clicked', async () => {
  renderInField();

  const toggle = screen.getByRole('button', { name: 'Show password requirements' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.passwordPolicy).not.toHaveBeenCalled();

  await open(toggle);

  const popover = screen.getByRole('dialog', { name: 'Password requirements' });
  expect(await screen.findByText('At least 12 characters')).toBeInTheDocument();
  expect(screen.getByText('At least 2 numbers')).toBeInTheDocument();
  expect(screen.getByText('! @ #')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hide password requirements' }))
    .toHaveAttribute('aria-controls', popover.id);
});

test('the toggle, Escape, and an outside click all close the popover', async () => {
  renderInField();
  const toggle = screen.getByRole('button', { name: 'Show password requirements' });

  await open(toggle);
  await userEvent.click(screen.getByRole('button', { name: 'Hide password requirements' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  await userEvent.click(toggle);
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(toggle).toHaveFocus();

  await userEvent.click(toggle);
  await userEvent.click(screen.getByLabelText('Password'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a failed request shows a fallback message', async () => {
  api.passwordPolicy.mockRejectedValue(new Error('offline'));
  renderInField();

  await open(screen.getByRole('button', { name: 'Show password requirements' }));

  expect(await screen.findByText(/requirements couldn.t be loaded/i)).toBeInTheDocument();
});

test('the popover stays inside a short window and scrolls instead', async () => {
  const originalHeight = window.innerHeight;
  window.innerHeight = 300;
  renderInField();
  // The field sits near the bottom of the 300px-tall window.
  jest.spyOn(screen.getByTestId('password-field'), 'getBoundingClientRect')
    .mockReturnValue({ top: 280, bottom: 320, left: 0, right: 200 });

  try {
    await open(screen.getByRole('button', { name: 'Show password requirements' }));

    const popover = screen.getByRole('dialog', { name: 'Password requirements' });
    const top = parseFloat(popover.style.top);
    const maxHeight = parseFloat(popover.style.maxHeight);
    expect(top).toBeLessThan(280);
    expect(top + maxHeight).toBeLessThanOrEqual(300);
  } finally {
    window.innerHeight = originalHeight;
  }
});
