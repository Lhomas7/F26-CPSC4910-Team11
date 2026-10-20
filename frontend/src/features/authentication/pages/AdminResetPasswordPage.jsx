import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import * as api from '../../../api';
import PasswordInput from '../../../components/forms/PasswordInput';
import PasswordRequirements from '../../../components/forms/PasswordRequirements';
import { validatePassword } from '../../../utils/accountValidation';
import '../Authentication.css';
import '../PasswordReset.css';

const METHODS = {
  totp: { label: 'Authenticator app code', hint: 'The 6-digit code from your app.' },
  backup: { label: 'Backup code', hint: 'One of your saved backup codes. Each works once.' },
};

function PasswordField({ id, label, ...inputProps }) {
  return (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>
      <PasswordInput
        id={id}
        label={label}
        className="login-input"
        autoComplete="new-password"
        {...inputProps}
      />
    </div>
  );
}

/**
 * Last step of an administrator password reset. The emailed link is not enough on
 * its own: the server also requires a current authenticator or backup code.
 */
export default function AdminResetPasswordPage() {
  const { uid, token } = useParams();
  const [method, setMethod] = useState('totp');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!code.trim()) {
      setError(`Enter your ${METHODS[method].label.toLowerCase()}.`);
      return;
    }
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
      await api.confirmAdminPasswordReset({
        uid,
        token,
        method,
        code: code.trim(),
        password,
        passwordConfirm: confirmation,
      });
      setPassword('');
      setConfirmation('');
      setCode('');
      setDone(true);
    } catch (requestError) {
      const data = requestError.data || {};
      // A bad, used, or expired link comes back as a bare `detail`; a wrong code or
      // a rejected password comes back as a field error, and a lockout as a 429.
      const isLinkProblem =
        requestError.status === 400 &&
        typeof data.detail === 'string' &&
        !data.code &&
        !data.password &&
        !data.password_confirm;
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
        <div className="login-check" aria-hidden="true">
          ✓
        </div>
        <h2>Password reset</h2>
        <p className="banner banner-success" role="status">
          Your password has been reset. Sign in with it to continue.
        </p>
        <Link className="button button-large button-primary login-button" to="/login">
          Go to sign in
        </Link>
      </>
    );
  } else if (linkInvalid) {
    content = (
      <>
        <h2>Link expired</h2>
        <p className="banner banner-error" role="alert">
          This password reset link is invalid or has expired. Ask another administrator to send a
          new one.
        </p>
        <Link className="button button-large button-primary login-button" to="/login">
          Back to sign in
        </Link>
      </>
    );
  } else {
    content = (
      <form className="login-form" onSubmit={submit} noValidate>
        <h2>Reset administrator password</h2>
        {error && (
          <p className="banner banner-error" role="alert">
            {error}
          </p>
        )}
        <div className="login-field">
          <label htmlFor="admin-reset-method">Verify with</label>
          <select
            id="admin-reset-method"
            className="login-input"
            value={method}
            onChange={(event) => {
              setMethod(event.target.value);
              setCode('');
            }}
            disabled={busy}
          >
            {Object.entries(METHODS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="login-field">
          <label htmlFor="admin-reset-code">{METHODS[method].label}</label>
          <input
            id="admin-reset-code"
            className="login-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode={method === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck="false"
            disabled={busy}
          />
          <small>{METHODS[method].hint}</small>
        </div>
        <PasswordField
          id="admin-reset-password"
          label="New password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
        <PasswordRequirements />
        <PasswordField
          id="admin-reset-password-confirm"
          label="Confirm new password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
        />
        <button
          className="button button-large button-primary login-button"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    );
  }

  return (
    <div className="login-page login-page-single">
      <main className="login-side" aria-label="Reset administrator password page">
        <div className="card login-card">{content}</div>
      </main>
    </div>
  );
}
