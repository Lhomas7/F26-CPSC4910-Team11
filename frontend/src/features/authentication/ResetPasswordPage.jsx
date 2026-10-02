import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import * as api from '../../api';
import PasswordInput from '../../components/PasswordInput';
import { validatePassword } from '../../utils/accountValidation';
import './LoginPage.css';
import './PasswordResetPage.css';

function PasswordField({ id, label, ...inputProps }) {
  return (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>
      <PasswordInput id={id} label={label} className="login-input" autoComplete="new-password" {...inputProps} />
    </div>
  );
}

export default function ResetPasswordPage() {
  const { uid, token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
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
      await api.confirmPasswordReset({ uid, token, password, passwordConfirm: confirmation });
      setPassword('');
      setConfirmation('');
      setDone(true);
    } catch (requestError) {
      // The API answers 400 with the same message for a bad, used, or expired link
      // and for a password that fails server-side rules; only the first kind has
      // no field-level errors.
      const data = requestError.data || {};
      const isLinkProblem = requestError.status === 400
        && typeof data.detail === 'string'
        && !data.password
        && !data.password_confirm;
      if (isLinkProblem) {
        setLinkInvalid(true);
      } else {
        setError(requestError.message || 'Password could not be reset.');
      }
    } finally {
      setBusy(false);
    }
  };

  let content;
  if (done) {
    content = (
      <>
        <div className="login-check" aria-hidden="true">✓</div>
        <h2>Password reset</h2>
        <p className="login-alert login-alert-success" role="status">
          Your password has been reset. You can now sign in with it.
        </p>
        <Link className="login-btn" to="/login">Go to sign in</Link>
      </>
    );
  } else if (linkInvalid) {
    content = (
      <>
        <h2>Link expired</h2>
        <p className="login-alert login-alert-error" role="alert">
          This password reset link is invalid or has expired.
        </p>
        <Link className="login-btn" to="/forgot-password">Request a new link</Link>
      </>
    );
  } else {
    content = (
      <form className="login-form" onSubmit={submit} noValidate>
        <h2>Choose a new password</h2>
        <p className="login-sub">
          Use 12+ characters with 3 lowercase letters, 2 uppercase letters, 2 numbers,
          and an approved symbol.
        </p>
        {error && <p className="login-alert login-alert-error" role="alert">{error}</p>}
        <PasswordField
          id="reset-password"
          label="New password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
        <PasswordField
          id="reset-password-confirm"
          label="Confirm new password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
        />
        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    );
  }

  return (
    <div className="login-page login-page-single">
      <main className="login-side" aria-label="Reset password page">
        <div className="login-card">{content}</div>
      </main>
    </div>
  );
}
