import { useState } from 'react';

import { removeDriver } from '../../../api';
import Modal from '../../../components/feedback/Modal';

const MAX_REASON_LENGTH = 500;

/**
 * Reject a pending driver or drop an approved one. A reason is required and
 * saved with the change; the driver is unlinked but keeps their point history.
 */
export default function RemoveDriverDialog({ driver, onRemoved, onCancel }) {
  const dropping = driver.status === 'approved';
  const verb = dropping ? 'Drop' : 'Reject';
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError(`Enter a reason for ${dropping ? 'dropping' : 'rejecting'} this driver.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const record = await removeDriver(driver.id, reason);
      onRemoved(record);
    } catch (requestError) {
      setError(requestError.data?.reason?.[0] || requestError.message || 'The driver could not be removed.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${verb} ${driver.name}?`}
      onClose={busy ? undefined : onCancel}
      className="remove-driver-dialog"
      actions={(
        <>
          <button className="modal-button" type="button" onClick={onCancel} disabled={busy} data-autofocus>Cancel</button>
          <button className="modal-button danger" type="submit" form="remove-driver-form" disabled={busy}>
            {busy ? `${dropping ? 'Dropping' : 'Rejecting'}…` : dropping ? 'Drop from organization' : 'Reject driver'}
          </button>
        </>
      )}
    >
      <form id="remove-driver-form" onSubmit={submit} noValidate>
        <p>
          {dropping
            ? `${driver.name} will be removed from your organization. Their point history is kept, and they can join another sponsor.`
            : `${driver.name}'s application will be declined. They can apply to another sponsor.`}
        </p>
        <label htmlFor="remove-driver-reason">{dropping ? 'Reason for dropping' : 'Reason for rejecting'}</label>
        <textarea
          id="remove-driver-reason"
          value={reason}
          maxLength={MAX_REASON_LENGTH}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby="remove-driver-reason-help"
          disabled={busy}
        />
        <small id="remove-driver-reason-help" className={error ? 'error' : ''} role={error ? 'alert' : undefined}>
          {error || `Saved with the change. ${reason.length}/${MAX_REASON_LENGTH}`}
        </small>
      </form>
    </Modal>
  );
}
