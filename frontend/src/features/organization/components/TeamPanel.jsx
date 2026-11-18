import { useCallback, useState } from 'react';

import { getTeam, setTeamMemberActive } from 'api';
import ConfirmPasswordDialog from 'components/feedback/ConfirmPasswordDialog';
import StatePanel from 'components/feedback/StatePanel';
import useApiRequest from 'hooks/useApiRequest';

/** The sponsor users at this company, with a way to turn off a former employee's account. */
export default function TeamPanel() {
  const {
    data: team,
    status,
    error,
    reload,
    setData,
  } = useApiRequest(useCallback(() => getTeam(), []));
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState('');

  const confirm = async (password) => {
    const updated = await setTeamMemberActive(target.id, !target.is_active, password);
    setData((current) => current.map((member) => (member.id === updated.id ? updated : member)));
    setNotice(
      updated.is_active
        ? `${updated.name} can sign in again.`
        : `${updated.name} can no longer sign in.`,
    );
    setTarget(null);
  };

  if (status === 'error' || status === 'forbidden' || status === 'not-found') {
    return (
      <StatePanel tone="error" title="Your team couldn't be loaded">
        <p>{error.message}</p>
        <button className="button button-primary" type="button" onClick={reload}>
          Try again
        </button>
      </StatePanel>
    );
  }

  return (
    <section className="card organization-card" aria-labelledby="team-heading">
      <header>
        <h2 id="team-heading">Sponsor team</h2>
        <p>
          Turn off the account of anyone who has left your company so they can no longer sign in.
        </p>
      </header>
      {notice && (
        <p className="banner banner-success" role="status">
          {notice}
        </p>
      )}
      {!team ? (
        <p>Loading your team…</p>
      ) : (
        <ul className="organization-team">
          {team.map((member) => (
            <li key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <small>
                  @{member.username}
                  {member.email ? ` · ${member.email}` : ''}
                </small>
              </div>
              <span className={`organization-badge${member.is_active ? '' : ' is-off'}`}>
                {member.is_active ? 'Active' : 'Deactivated'}
              </span>
              {member.is_self ? (
                <small>This is you</small>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setNotice('');
                    setTarget(member);
                  }}
                  aria-label={`${member.is_active ? 'Deactivate' : 'Reactivate'} ${member.name}`}
                >
                  {member.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {target && (
        <ConfirmPasswordDialog
          title={target.is_active ? `Deactivate ${target.name}?` : `Reactivate ${target.name}?`}
          message={
            target.is_active
              ? `${target.name} will no longer be able to sign in. You can reactivate the account later.`
              : `${target.name} will be able to sign in again.`
          }
          confirmLabel={target.is_active ? 'Deactivate account' : 'Reactivate account'}
          onConfirm={confirm}
          onCancel={() => setTarget(null)}
        />
      )}
    </section>
  );
}
