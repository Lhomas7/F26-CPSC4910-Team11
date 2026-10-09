import ViewedIdentitySummary from '../components/primitives/ViewedIdentitySummary';
import { ViewingAsIcon } from '../components/primitives/Icons';
import './ActiveViewAsIndicator.css';

export default function ActiveViewAsIndicator({ user, busy, error, onReturn }) {
  const administrator = user.impersonation.admin;

  return (
    <section className="view-as-indicator" aria-label="Viewing as another user">
      <ViewingAsIcon className="view-as-indicator-icon" size={22} />
      <div className="view-as-indicator-copy">
        <span className="view-as-indicator-prefix">Viewing as</span>
        <ViewedIdentitySummary
          className="view-as-indicator-identity"
          name={user.name || user.username}
          username={user.username}
          role={user.account_type}
          organization={user.company}
          showAvatar={false}
        />
        <p>
          Signed in as <strong>{administrator.name || administrator.username}</strong>. This session
          is recorded.
        </p>
      </div>
      <button
        className="button button-large view-as-return"
        type="button"
        onClick={onReturn}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? 'Returning…' : 'Return to administrator account'}
      </button>
      {error && (
        <div className="view-as-exit-error" role="alert">
          <strong>Couldn&apos;t return to your administrator account.</strong>
          <span>
            You are still viewing as {user.name || user.username}, and requests still use their
            access. Check your connection and try again.
          </span>
        </div>
      )}
    </section>
  );
}
