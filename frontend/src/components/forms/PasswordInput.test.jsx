import { fireEvent, render, screen } from '@testing-library/react';

import PasswordInput from './PasswordInput';

function renderInput(props = {}) {
  return render(
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" label="Password" value="secret" onChange={() => {}} {...props} />
    </>,
  );
}

test('toggles its own visibility when uncontrolled', () => {
  renderInput();
  const input = screen.getByLabelText('Password');

  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
});

test('defers to the parent when visible is passed', () => {
  const onToggleVisible = jest.fn();
  renderInput({ visible: true, onToggleVisible });

  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(onToggleVisible).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
});

test('disables the toggle along with the input', () => {
  renderInput({ disabled: true });

  expect(screen.getByLabelText('Password')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
});
