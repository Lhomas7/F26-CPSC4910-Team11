import { useState } from 'react';

import * as api from 'api';
import Modal from 'components/feedback/Modal';
import { membershipStatus } from 'features/sponsors';
import SponsorCheckboxList from 'features/sponsors/components/SponsorCheckboxList';

const ACTIVE_STATUSES = ['pending', 'approved'];
const ACTION_LABELS = {
  applied: 'Applied',
  approved: 'Approved by sponsor',
  rejected: 'Rejected by sponsor',
  dropped: 'Dropped by sponsor',
  assigned: 'Added by an administrator',
  removed: 'Removed by an administrator',
};
const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function RemoveSponsorDialog({ driverName, membership, busy, error, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    if (!reason.trim()) {
      setMissing(true);
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Modal
      title={`Remove ${driverName} from ${membership.sponsor.name}?`}
      onClose={busy ? undefined : onCancel}
      actions={
        <>
          <button
            className="button"
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-autofocus
          >
            Cancel
          </button>
          <button
            className="button button-danger"
            type="submit"
            form="remove-driver-sponsor-form"
            disabled={busy}
          >
            {busy ? 'Removing…' : 'Remove from sponsor'}
          </button>
        </>
      }
    >
      <form id="remove-driver-sponsor-form" onSubmit={submit} noValidate>
        <p>
          Only this sponsor changes. The driver keeps their other sponsors and all point history,
          and is told the reason.
        </p>
        <label htmlFor="remove-driver-sponsor-reason">Reason</label>
        <textarea
          id="remove-driver-sponsor-reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setMissing(false);
          }}
          aria-invalid={missing || Boolean(error)}
          aria-describedby="remove-driver-sponsor-error"
          rows={3}
        />
        <small
          id="remove-driver-sponsor-error"
          className="error"
          role={error ? 'alert' : undefined}
        >
          {missing ? 'Enter a reason for removing this driver.' : error}
        </small>
      </form>
    </Modal>
  );
}

/** An administrator's view of every sponsor a driver belongs to, with audited changes. */
export default function DriverSponsorsPanel({ userId, account, organizations, onChanged }) {
  const memberships = account.sponsor_memberships || [];
  const history = account.status_history || [];
  const [selected, setSelected] = useState([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [notice, setNotice] = useState('');

  const activeIds = new Set(
    memberships
      .filter((membership) => ACTIVE_STATUSES.includes(membership.status))
      .map((membership) => membership.sponsor.id),
  );
  const available = organizations.filter((organization) => !activeIds.has(organization.id));

  const add = async (event) => {
    event.preventDefault();
    setAdding(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.assignDriverSponsors(userId, selected);
      const names = organizations
        .filter((organization) => selected.includes(organization.id))
        .map((organization) => organization.name);
      setSelected([]);
      setNotice(`Added to ${names.join(', ')}. The driver is approved there now.`);
      onChanged(updated);
    } catch (failure) {
      setError(failure.message || 'The driver could not be added.');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (reason) => {
    setBusy(true);
    setRemoveError('');
    try {
      const updated = await api.removeDriverSponsor(userId, removing.sponsor.id, reason);
      setNotice(`Removed from ${removing.sponsor.name}.`);
      setRemoving(null);
      onChanged(updated);
    } catch (failure) {
      setRemoveError(failure.message || 'The driver could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card driver-sponsors-panel" aria-labelledby="driver-sponsors-heading">
      <div className="sponsor-detail-card-head">
        <h2 id="driver-sponsors-heading">Sponsors</h2>
      </div>
      <div className="driver-sponsors-body">
        {notice && (
          <p className="banner banner-success" role="status">
            {notice}
          </p>
        )}
        {memberships.length ? (
          <table className="driver-sponsors-table">
            <thead>
              <tr>
                <th scope="col">Sponsor</th>
                <th scope="col">Status</th>
                <th scope="col">Points</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((membership) => {
                const { label, badge } = membershipStatus(membership.status);
                return (
                  <tr key={membership.sponsor.id}>
                    <th scope="row">{membership.sponsor.name}</th>
                    <td>
                      <span className={`badge badge-dot ${badge}`}>{label}</span>
                    </td>
                    <td>
                      {membership.status === 'approved'
                        ? Number(membership.point_balance || 0).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      {ACTIVE_STATUSES.includes(membership.status) && (
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveError('');
                            setRemoving(membership);
                          }}
                          aria-label={`Remove from ${membership.sponsor.name}`}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p>
            <i>Not with any sponsor yet.</i>
          </p>
        )}

        {available.length > 0 && (
          <form className="driver-sponsors-add" onSubmit={add}>
            <SponsorCheckboxList
              legend="Add to sponsors"
              hint="Added drivers are approved right away, and the change is recorded."
              sponsors={available}
              selected={selected}
              onChange={setSelected}
              disabled={adding}
            />
            {error && (
              <p className="banner banner-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" type="submit" disabled={adding || !selected.length}>
              {adding ? 'Adding…' : 'Add to selected sponsors'}
            </button>
          </form>
        )}

        <h3>Status history</h3>
        {history.length ? (
          <ol className="driver-sponsors-history">
            {history.map((change) => (
              <li key={change.id}>
                <strong>{ACTION_LABELS[change.action] || change.action}</strong>
                {' · '}
                {change.sponsor.name}
                <small>
                  <time dateTime={change.changed_at}>
                    {dateTime.format(new Date(change.changed_at))}
                  </time>
                  {change.changed_by && ` by ${change.changed_by}`}
                </small>
                {change.reason && <p>Reason: {change.reason}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p>
            <i>No membership changes yet.</i>
          </p>
        )}
      </div>
      {removing && (
        <RemoveSponsorDialog
          driverName={account.display_name}
          membership={removing}
          busy={busy}
          error={removeError}
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
