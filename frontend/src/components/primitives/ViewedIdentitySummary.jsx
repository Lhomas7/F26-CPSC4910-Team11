import Avatar from './Avatar';
import './ViewedIdentitySummary.css';

const ROLE_LABELS = {
  admin: 'Administrator',
  driver: 'Driver',
  sponsor: 'Sponsor',
};

/** Compact identity summary shared by View-as entry and active-session UI. */
export default function ViewedIdentitySummary({
  name,
  username,
  role,
  organization,
  avatarSrc,
  status,
}) {
  return (
    <div className="viewed-identity-summary">
      <Avatar className="viewed-identity-avatar" name={name || username} src={avatarSrc} />
      <div className="viewed-identity-details">
        <div className="viewed-identity-heading">
          <strong>{name || username}</strong>
          {role && <span className="badge badge-neutral">{ROLE_LABELS[role] || role}</span>}
          {status && (
            <span className={`badge ${status === 'Active' ? 'badge-success' : 'badge-neutral'}`}>
              {status}
            </span>
          )}
        </div>
        {username && <span className="viewed-identity-username">@{username}</span>}
        {organization && <span className="viewed-identity-organization">{organization}</span>}
      </div>
    </div>
  );
}
