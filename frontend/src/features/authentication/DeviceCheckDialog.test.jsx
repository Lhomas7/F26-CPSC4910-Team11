import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DeviceCheckDialog from './DeviceCheckDialog';

function renderDialog(props = {}) {
  const handlers = { onAnswer: jest.fn().mockResolvedValue(), onSignOut: jest.fn(), ...props };
  render(<DeviceCheckDialog reason="new_device" {...handlers} />);
  return handlers;
}

test('explains a new browser and focuses the Yes button', () => {
  renderDialog();

  expect(screen.getByRole('dialog', { name: 'Is this your device?' }))
    .toHaveTextContent('first time this account has signed in on this browser');
  expect(screen.getByRole('button', { name: 'Yes, remember this device' })).toHaveFocus();
});

test('explains recent failed attempts', () => {
  render(<DeviceCheckDialog reason="recent_failures" onAnswer={jest.fn()} onSignOut={jest.fn()} />);

  expect(screen.getByRole('dialog')).toHaveTextContent('several failed sign-in attempts');
});

test('each answer sends the matching value', async () => {
  const yes = renderDialog();
  await act(async () => {
    userEvent.click(screen.getByRole('button', { name: 'Yes, remember this device' }));
  });
  expect(yes.onAnswer).toHaveBeenCalledWith(true);
});

test('No sends false', async () => {
  const no = renderDialog();
  await act(async () => {
    userEvent.click(screen.getByRole('button', { name: 'No, this is a shared or public device' }));
  });
  expect(no.onAnswer).toHaveBeenCalledWith(false);
});

test('Escape does not dismiss the question', () => {
  renderDialog();

  userEvent.keyboard('{Escape}');

  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('a failed answer shows an error and re-enables the buttons', async () => {
  renderDialog({ onAnswer: jest.fn().mockRejectedValue(new Error('Network error')) });

  await act(async () => {
    userEvent.click(screen.getByRole('button', { name: 'Yes, remember this device' }));
  });

  expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  expect(screen.getByRole('button', { name: 'Yes, remember this device' })).toBeEnabled();
});

test('Sign out instead signs out', () => {
  const handlers = renderDialog();

  userEvent.click(screen.getByRole('button', { name: 'Sign out instead' }));

  expect(handlers.onSignOut).toHaveBeenCalled();
});
