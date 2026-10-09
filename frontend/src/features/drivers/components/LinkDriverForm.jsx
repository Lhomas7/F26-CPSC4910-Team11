import { useState } from 'react';

import { linkDriver } from '../../../api';
import Modal from '../../../components/feedback/Modal';

export default function LinkDriverForm({
  company,
  onLinked,
  triggerClassName = '',
  primary = true,
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    setOpen(false);
    setUsername('');
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      setError('Enter the driver’s username.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const driver = await linkDriver(normalizedUsername);
      setOpen(false);
      setUsername('');
      onLinked(driver);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={`button${primary ? ' button-primary' : ''} ${triggerClassName}`.trim()}
        type="button"
        onClick={() => setOpen(true)}
      >
        <span className="drivers-add-icon" aria-hidden="true">
          +
        </span>
        <span>Link driver</span>
      </button>
      {open && (
        <Modal
          title="Link a driver"
          onClose={close}
          className="link-driver-dialog"
          actions={
            <>
              <button className="button button-large" type="button" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button
                className="button button-large button-primary"
                type="submit"
                form="link-driver-form"
                disabled={busy}
              >
                {busy ? 'Linking…' : 'Link driver'}
              </button>
            </>
          }
        >
          <p>
            Add an existing driver account to {company || 'your organization'} by username. They
            join as a pending application until you approve them.
          </p>
          <form id="link-driver-form" onSubmit={submit} noValidate>
            <label htmlFor="link-username">Driver username</label>
            <input
              id="link-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. jamie.rivera"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              aria-describedby="link-username-help"
              aria-invalid={Boolean(error)}
              data-autofocus
            />
            <small id="link-username-help" className={error ? 'error' : ''}>
              {error || 'The driver gives you the username they sign in with.'}
            </small>
          </form>
        </Modal>
      )}
    </>
  );
}
