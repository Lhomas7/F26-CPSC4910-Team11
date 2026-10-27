import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ConfirmPasswordDialog from './ConfirmPasswordDialog';

function renderDialog(onConfirm, onCancel = jest.fn()) {
  render(
    <ConfirmPasswordDialog
      title="Deactivate this account?"
      message="They won't be able to sign in."
      confirmLabel="Deactivate account"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onCancel };
}

test('passes the entered password to onConfirm', async () => {
  const onConfirm = jest.fn().mockResolvedValue();
  renderDialog(onConfirm);

  expect(screen.getByLabelText('Your current password')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('Your current password'), {
    target: { value: 'AdminPassword123!' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));

  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('AdminPassword123!'));
});

test('asks for a password before confirming', () => {
  const onConfirm = jest.fn();
  renderDialog(onConfirm);

  fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Enter your current password.');
  expect(onConfirm).not.toHaveBeenCalled();
});

test('shows a wrong-password answer and stays open', async () => {
  const error = Object.assign(new Error('Bad request'), {
    data: { current_password: ['Incorrect password.'] },
  });
  renderDialog(jest.fn().mockRejectedValue(error));

  fireEvent.change(screen.getByLabelText('Your current password'), { target: { value: 'nope' } });
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password.');
  expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeEnabled();
});

test('Cancel closes without confirming', () => {
  const onConfirm = jest.fn();
  const { onCancel } = renderDialog(onConfirm);

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(onCancel).toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});
