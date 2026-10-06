import { useState } from 'react';

import Modal from '../../components/Modal';
import './DeviceCheckDialog.css';

const REASON_TEXT = {
  new_device: 'This is the first time this account has signed in on this browser.',
  recent_failures:
    'There were several failed sign-in attempts on this account just before this one.',
};

/**
 * Shown after a sign-in the server flagged (new browser or recent failed
 * attempts). It can't be dismissed: the user either answers or signs out.
 */
export default function DeviceCheckDialog({ reason, onAnswer, onSignOut }) {
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
      title="Is this your device?"
      actions={(
        <div className="device-check-actions">
          <button
            className="modal-button primary"
            type="button"
            onClick={() => answer(true)}
            disabled={busy}
            data-autofocus
          >
            Yes, remember this device
          </button>
          <button className="modal-button" type="button" onClick={() => answer(false)} disabled={busy}>
            No, this is a shared or public device
          </button>
          <button className="device-check-signout" type="button" onClick={onSignOut} disabled={busy}>
            Sign out instead
          </button>
        </div>
      )}
    >
      <p>{REASON_TEXT[reason] || REASON_TEXT.new_device}</p>
      <p>
        If you choose <strong>No</strong>, you&apos;ll be signed out when the browser closes or
        after a short period of inactivity, and we&apos;ll email you about this sign-in.
      </p>
      {error && <p className="device-check-error" role="alert">{error}</p>}
    </Modal>
  );
}
