import { useState } from 'react';
import { Link } from 'react-router-dom';

import * as api from '../../../api';
import { validateEmail } from '../../../utils/accountValidation';
import '../Authentication.css';
import '../PasswordReset.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const result = await api.requestPasswordReset(email.trim());
      setMessage(
        result?.detail ||
          'If an account uses that email address, a password reset link has been sent.',
      );
    } catch (requestError) {
      setError(requestError.message || 'The reset request could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page login-page-single">
      <main className="login-side" aria-label="Forgot password page">
        <div className="card login-card">
          <h2>Forgot your password?</h2>
          {message ? (
            <>
              <p className="banner banner-success" role="status">
                {message}
              </p>
              <p className="login-sub">
                The link expires after a short time and can only be used once. Check your spam
                folder if it does not arrive within a few minutes.
              </p>
              <p className="login-help">
                <Link className="login-link" to="/login">
                  Back to sign in
                </Link>
              </p>
            </>
          ) : (
            <form className="login-form" onSubmit={submit} noValidate>
              <p className="login-sub">
                Enter the email address on your account and we will send you a link to choose a new
                password.
              </p>
              {error && (
                <p className="banner banner-error" role="alert">
                  {error}
                </p>
              )}
              <div className="login-field">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  className={
                    error && !email.trim() ? 'login-input login-input-error' : 'login-input'
                  }
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  disabled={busy}
                />
              </div>
              <button
                className="button button-large button-primary login-button"
                type="submit"
                disabled={busy}
              >
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="login-help">
                <Link className="login-link" to="/login">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
