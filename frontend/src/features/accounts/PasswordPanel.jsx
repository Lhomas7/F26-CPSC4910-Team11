import { useState } from 'react';

import * as api from '../../api';
import PasswordInput from '../../components/forms/PasswordInput';
import PasswordRequirements from '../../components/forms/PasswordRequirements';
import { validatePassword } from '../../utils/accountValidation';

function PasswordField({ id, label, ...inputProps }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <PasswordInput id={id} label={label} autoComplete="new-password" {...inputProps} />
    </>
  );
}

export default function PasswordPanel() {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const closePanel = () => {
    setExpanded(false);
    setPassword('');
    setConfirmation('');
    setPasswordVisible(false);
    setConfirmationVisible(false);
    setError('');
    setSuccess('');
  };

  const togglePanel = () => {
    if (expanded) {
      closePanel();
    } else {
      setExpanded(true);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const problem = validatePassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(password, confirmation);
      setPassword('');
      setConfirmation('');
      setPasswordVisible(false);
      setConfirmationVisible(false);
      setSuccess('Password changed successfully.');
    } catch (requestError) {
      setError(requestError.message || 'Password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card account-card" aria-labelledby="password-heading">
      <div className="account-card-header">
        <div>
          <h2 id="password-heading">Password</h2>
          <p>Change the password you use to sign in</p>
        </div>
        <button
          className="button"
          type="button"
          onClick={togglePanel}
          aria-expanded={expanded}
          aria-controls="password-panel-content"
          disabled={busy}
        >
          {expanded ? 'Close' : 'Change password'}
        </button>
      </div>
      {expanded && (
        <form id="password-panel-content" className="password-form" onSubmit={changePassword}>
          <PasswordField
            id="new-password"
            label="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            visible={passwordVisible}
            onToggleVisible={() => setPasswordVisible((current) => !current)}
            disabled={busy}
          />
          <PasswordRequirements />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            visible={confirmationVisible}
            onToggleVisible={() => setConfirmationVisible((current) => !current)}
            disabled={busy}
          />
          {error && <p className="banner banner-error account-banner" role="alert">{error}</p>}
          {success && <p className="banner banner-success account-banner" role="status">{success}</p>}
          <div className="account-card-footer">
            <button className="button" type="button" onClick={closePanel} disabled={busy}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Changing password…' : 'Save new password'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
