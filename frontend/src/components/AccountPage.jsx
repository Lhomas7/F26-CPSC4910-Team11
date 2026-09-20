import { useState } from 'react';
import * as api from '../config/api';
import { useAuth } from '../auth/AuthContext';

function AccountPage() {
  const { user } = useAuth();

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  const validate = () => {
    if (!password) {
      return 'Enter a new password.';
    }

    if (password.length < 12) {
      return 'Password must be at least 12 characters long.';
    }

    if (!/[A-Za-z]/.test(password)) {
      return 'Password must contain at least one letter.';
    }

    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number.';
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return 'Password must contain at least one symbol.';
    }

    if (password !== passwordConfirm) {
      return 'Passwords do not match.';
    }

    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError(null);
    setSuccess(null);

    const problem = validate();

    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);

    try {
      await api.changePassword(password);

      setPassword('');
      setPasswordConfirm('');
      setSuccess('Password changed successfully.');
    } catch (err) {
      setError(err.message || 'Password could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Account</h1>

      <p>
        Signed in as {user?.name || user?.username}
      </p>

      <section>
        <h2>Change Password</h2>

        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          {error && (
            <p role="alert">
              {error}
            </p>
          )}

          {success && (
            <p role="status">
              {success}
            </p>
          )}

          <button type="submit" disabled={busy}>
            {busy ? 'Changing password...' : 'Change Password'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default AccountPage;