import { useState } from 'react';

import * as api from '../config/api';

function validatePassword(password, confirmation) {
  if (!password) return 'Enter a new password.';
  if (password.length < 12) return 'Password must be at least 12 characters long.';
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one symbol.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

function PasswordField({ id, label, value, onChange, visible, onToggle, disabled }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="account-password-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete="new-password"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
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
    const problem = validatePassword(password, confirmation);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(password);
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
    <section className="account-card" aria-labelledby="password-heading">
      <div className="account-card-header">
        <div>
          <h2 id="password-heading">Password</h2>
          <p>Change the password you use to sign in</p>
        </div>
        <button
          className="account-button"
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
            onToggle={() => setPasswordVisible((current) => !current)}
            disabled={busy}
          />
          <small>Use at least 12 characters, including a letter, number, and symbol.</small>
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            visible={confirmationVisible}
            onToggle={() => setConfirmationVisible((current) => !current)}
            disabled={busy}
          />
          {error && <p className="account-banner error" role="alert">{error}</p>}
          {success && <p className="account-banner success" role="status">{success}</p>}
          <div className="account-card-footer">
            <button className="account-button" type="button" onClick={closePanel} disabled={busy}>Cancel</button>
            <button className="account-button primary" type="submit" disabled={busy}>
              {busy ? 'Changing password…' : 'Save new password'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
