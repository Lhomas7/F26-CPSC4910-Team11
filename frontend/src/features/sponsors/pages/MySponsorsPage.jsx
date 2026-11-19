import { useCallback, useState } from 'react';

import { applyToSponsors, getPublicSponsors } from 'api';
import PageHeader from 'app/PageHeader';
import { useAuth } from 'auth/AuthContext';
import StatePanel from 'components/feedback/StatePanel';
import useApiRequest from 'hooks/useApiRequest';
import { useActiveSponsor } from '../ActiveSponsorContext';
import SponsorCheckboxList from '../components/SponsorCheckboxList';
import membershipStatus from '../membershipStatus';
import useSwitchBlocked from '../useSwitchBlocked';
import '../Sponsors.css';

const ACTIVE_STATUSES = ['pending', 'approved'];

/** The server answers per sponsor ({id: message}) or with one message. */
function applyErrors(failure) {
  const detail = failure?.data?.sponsor_ids;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) return Object.values(detail);
  return [failure?.message || 'Your application could not be sent.'];
}

function MembershipList({ memberships, activeSponsor, onSwitch, switchingId, blocked }) {
  if (!memberships.length) {
    return <p>You haven&apos;t applied to any sponsors yet.</p>;
  }
  return (
    <ul className="my-sponsors-list">
      {memberships.map((membership) => {
        const { label, badge } = membershipStatus(membership.status);
        const approved = membership.status === 'approved';
        const active = activeSponsor?.sponsor.id === membership.sponsor.id;
        return (
          <li className="my-sponsors-item" key={membership.sponsor.id}>
            <div>
              <strong>{membership.sponsor.name}</strong>
              <span className={`badge badge-dot ${badge}`}>{label}</span>
            </div>
            {approved && (
              <span className="my-sponsors-balance">
                {Number(membership.point_balance || 0).toLocaleString()} <small>pts</small>
              </span>
            )}
            {active ? (
              <span className="my-sponsors-active">Shopping now</span>
            ) : (
              approved && (
                <button
                  className="button"
                  type="button"
                  disabled={switchingId !== null || blocked}
                  onClick={() => onSwitch(membership.sponsor.id)}
                >
                  {switchingId === membership.sponsor.id ? 'Switching…' : 'Shop with this sponsor'}
                </button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ApplyForm({ memberships, viewingAs, onApplied }) {
  const publicSponsors = useApiRequest(useCallback(() => getPublicSponsors(), []));
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState('');

  // Rejected and removed sponsors can be applied to again.
  const activeIds = new Set(
    memberships
      .filter((membership) => ACTIVE_STATUSES.includes(membership.status))
      .map((membership) => membership.sponsor.id),
  );
  const available = (publicSponsors.data ?? []).filter((sponsor) => !activeIds.has(sponsor.id));

  const submit = async (event) => {
    event.preventDefault();
    if (!selected.length) {
      setErrors(['Choose at least one sponsor.']);
      return;
    }
    setBusy(true);
    setErrors([]);
    setNotice('');
    try {
      const next = await applyToSponsors(selected);
      const names = next.memberships
        .filter((membership) => selected.includes(membership.sponsor.id))
        .map((membership) => membership.sponsor.name);
      setSelected([]);
      setNotice(`Application sent to ${names.join(', ')}. Each sponsor reviews it separately.`);
      onApplied(next);
    } catch (failure) {
      setErrors(applyErrors(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card my-sponsors-apply" aria-labelledby="apply-heading">
      <h2 id="apply-heading">Apply to more sponsors</h2>
      {notice && (
        <p className="banner banner-success" role="status">
          {notice}
        </p>
      )}
      {publicSponsors.status === 'loading' && !publicSponsors.data && <p>Loading sponsors…</p>}
      {publicSponsors.error && !publicSponsors.data && (
        <p className="banner banner-error" role="alert">
          Sponsors couldn&apos;t be loaded.{' '}
          <button className="button" type="button" onClick={publicSponsors.reload}>
            Try again
          </button>
        </p>
      )}
      {publicSponsors.data && !available.length && (
        <p>You&apos;ve applied to or joined every sponsor in the program.</p>
      )}
      {available.length > 0 && (
        <form onSubmit={submit}>
          {viewingAs && (
            <p className="banner">
              You&apos;re viewing as this driver, so you can&apos;t apply for them.
            </p>
          )}
          <SponsorCheckboxList
            legend="Sponsors"
            sponsors={available}
            selected={selected}
            onChange={setSelected}
            disabled={busy || viewingAs}
          />
          {errors.length > 0 && (
            <div className="banner banner-error" role="alert">
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || viewingAs || !selected.length}
          >
            {busy ? 'Sending…' : 'Apply'}
          </button>
        </form>
      )}
    </section>
  );
}

export default function MySponsorsPage() {
  const { user } = useAuth();
  const sponsors = useActiveSponsor();
  const [switchingId, setSwitchingId] = useState(null);
  const [switchError, setSwitchError] = useState('');
  const viewingAs = Boolean(user?.impersonation?.active);
  const switchBlocked = useSwitchBlocked();

  const switchTo = async (sponsorId) => {
    setSwitchingId(sponsorId);
    setSwitchError('');
    try {
      await sponsors.switchSponsor(sponsorId);
    } catch (failure) {
      setSwitchError(failure.message || 'Could not switch sponsors.');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="my-sponsors-page">
      <PageHeader
        title="My sponsors"
        subtitle="Each sponsor keeps its own points, catalog, and cart"
      />
      <main className="my-sponsors-content">
        {!sponsors.loaded && sponsors.status === 'loading' && <p>Loading…</p>}
        {!sponsors.loaded && sponsors.error && (
          <StatePanel tone="error" title="Your sponsors couldn't be loaded">
            <p>{sponsors.error.message}</p>
            <button className="button button-primary" type="button" onClick={sponsors.reload}>
              Try again
            </button>
          </StatePanel>
        )}
        {sponsors.loaded && (
          <>
            <section className="card" aria-labelledby="memberships-heading">
              <h2 id="memberships-heading">Your sponsors</h2>
              {switchError && (
                <p className="banner banner-error" role="alert">
                  {switchError}
                </p>
              )}
              <MembershipList
                memberships={sponsors.memberships}
                activeSponsor={sponsors.activeSponsor}
                onSwitch={switchTo}
                switchingId={switchingId}
                blocked={switchBlocked}
              />
              {switchBlocked && (
                <p className="my-sponsors-note">Finish your purchase before switching sponsors.</p>
              )}
            </section>
            <ApplyForm
              memberships={sponsors.memberships}
              viewingAs={viewingAs}
              onApplied={sponsors.setData}
            />
          </>
        )}
      </main>
    </div>
  );
}
