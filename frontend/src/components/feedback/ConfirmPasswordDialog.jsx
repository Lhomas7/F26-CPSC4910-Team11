import { useId, useState } from 'react';

import PasswordInput from '../forms/PasswordInput';
import Modal from './Modal';

/**
 * Ask the signed-in user for their current password before a consequential
 * action. `onConfirm(password)` performs the action; if it rejects, the
 * server's `current_password` message (or the error message) is shown here so
 * the user can try again. On success the caller closes the dialog.
 */
export default function ConfirmPasswordDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}) {
  const formId = useId();
  const inputId = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your current password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err.data?.current_password?.[0] || err.message || 'That did not work. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onCancel}
      actions={
        <>
          <button className="button button-large" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="button button-large button-primary"
            type="submit"
            form={formId}
            disabled={busy}
          >
            {busy ? 'Checking…' : confirmLabel}
          </button>
        </>
      }
    >
      <form id={formId} className="confirm-password-form" onSubmit={submit}>
        <p>{message}</p>
        <label htmlFor={inputId}>Your current password</label>
        <PasswordInput
          id={inputId}
          label="Current password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          data-autofocus
        />
        {error && (
          <p className="banner banner-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
