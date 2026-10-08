import { useState } from 'react';

import Modal from '../../../components/feedback/Modal';
import './DeviceCheckDialog.css';

/**
 * Shown after a sign-in the server flagged (new browser or recent failed
 * attempts). It can't be dismissed: the user either answers or signs out.
 */
export default function DeviceCheckDialog({ onAnswer, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const answer = async (trusted) => {
    setBusy(true);
    setError('');
    try {
      await onAnswer(trusted);
    } catch (err) {
      setError(err.message || 'Your answer could not be saved. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      className="device-check"
      title="Is this your device?"
      actions={(
        <div className="device-check-actions">
          <button
            className="button button-large button-primary"
            type="button"
            onClick={() => answer(true)}
            disabled={busy}
            data-autofocus
          >
            Yes, remember this device
          </button>
          <button className="button button-large" type="button" onClick={() => answer(false)} disabled={busy}>
            No, this is a shared or public device
          </button>
          <button className="device-check-signout" type="button" onClick={onSignOut} disabled={busy}>
            Sign out instead
          </button>
        </div>
      )}
    >
      {error && <p className="device-check-error" role="alert">{error}</p>}
    </Modal>
  );
}
