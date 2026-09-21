import { useState } from 'react';
import { Link } from 'react-router-dom';

import * as api from '../config/api';
import { useAuth } from '../auth/AuthContext';
import './LoginPage.css';

const ROLE_LABEL = { driver: 'Driver', sponsor: 'Sponsor' };

export default function LoginPage() {
  const { loading, user, signIn, signOut } = useAuth();

  let content;
  if (loading) {
    content = <LoadingCard />;
  } else if (user) {
    content = <LoggedInCard user={user} onSignOut={signOut} />;
  } else {
    content = <AuthCard onSignIn={signIn} />;
  }

  return (
    <div className="login-page">
      <aside className="login-road">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true" />
          <span className="login-brand-name">Good Driver</span>
        </div>
        <div className="login-pitch">
          <h1>Safe miles add up to real rewards.</h1>
          <p>Your sponsor company gives you points for driving well. Sign in to check your balance and see what you can redeem.</p>
          <ul className="login-perks">
            <li>Points from your sponsor for safe driving</li>
            <li>A catalog of rewards picked by your sponsor</li>
            <li>A full history of every point change and why</li>
          </ul>
        </div>
        <div className="login-lane" aria-hidden="true">
          <div className="login-truck">
            <span className="login-trailer" />
            <span className="login-cab" />
            <span className="login-wheel login-wheel-a" />
            <span className="login-wheel login-wheel-b" />
            <span className="login-wheel login-wheel-c" />
          </div>
        </div>
        <div className="login-road-foot">
          <span>Team 11, v0.1.0 (Sprint 1)</span>
          <Link to="/about">About this app</Link>
        </div>
      </aside>

      <main className="login-side" aria-label="Sign in page">
        {content}
      </main>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="login-card" role="status">
      <p className="login-loading">Checking your session…</p>
    </div>
  );
}

function LoggedInCard({ user, onSignOut }) {
  const [signingOut, setSigningOut] = useState(false);

  const submit = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div className="login-card login-card-success">
      <div className="login-check" aria-hidden="true">✓</div>
      <h2>Logged in successfully</h2>
      <p className="login-sub">Your session is active.</p>
      <dl className="login-session">
        <div><dt>Username</dt><dd>{user.username}</dd></div>
        <div><dt>Account type</dt><dd>{ROLE_LABEL[user.account_type] || user.account_type}</dd></div>
        {user.company && <div><dt>Organization</dt><dd>{user.company}</dd></div>}
        {user.name && <div><dt>Name</dt><dd>{user.name}</dd></div>}
      </dl>
      <button className="login-btn login-btn-outline" type="button" disabled={signingOut} onClick={submit}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

function AuthCard({ onSignIn }) {
  const [view, setView] = useState('signin');
  const [role, setRole] = useState(null);
  const [notice, setNotice] = useState(null);

  const switchToSignIn = () => {
    setView('signin');
    setRole(null);
  };

  const switchToSignUp = () => {
    setView('signup');
    setRole(null);
    setNotice(null);
  };

  const handleRegistered = (message) => {
    setNotice(message);
    switchToSignIn();
  };

  return (
    <div className="login-card">
      <div className="login-tabs" role="group" aria-label="Choose sign in or account creation">
        <button
          type="button"
          className={view === 'signin' ? 'login-tab active' : 'login-tab'}
          onClick={switchToSignIn}
          aria-pressed={view === 'signin'}
        >
          Sign In
        </button>
        <button
          type="button"
          className={view === 'signup' ? 'login-tab active' : 'login-tab'}
          onClick={switchToSignUp}
          aria-pressed={view === 'signup'}
        >
          Create Account
        </button>
      </div>

      {notice && <p className="login-alert login-alert-success" role="status">{notice}</p>}

      {view === 'signin' && <LoginForm onSignIn={onSignIn} />}

      {view === 'signup' && role === null && <RoleChoice onPick={setRole} />}

      {view === 'signup' && role === 'driver' && (
        <RoleRegistrationForm role="driver" onBack={() => setRole(null)} onDone={handleRegistered} />
      )}

      {view === 'signup' && role === 'sponsor' && (
        <RoleRegistrationForm role="sponsor" onBack={() => setRole(null)} onDone={handleRegistered} />
      )}
    </div>
  );
}

function LoginForm({ onSignIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('Enter your username.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    try {
      await onSignIn(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = (bad) => bad ? 'login-input login-input-error' : 'login-input';

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <h2>Sign in</h2>
      <p className="login-sub">Use the username and password from your account.</p>

      {error && <p className="login-alert login-alert-error" role="alert">{error}</p>}

      <div className="login-field">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          className={fieldClass(error && !username.trim())}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
        />
      </div>

      <div className="login-field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          className={fieldClass(error && !password)}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
      </div>

      <button className="login-btn" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
      <p className="login-help">Can&apos;t sign in? Contact your sponsor company to check your account.</p>
    </form>
  );
}

function RoleChoice({ onPick }) {
  return (
    <div className="login-choice">
      <h2>Create an account</h2>
      <p className="login-sub">Which kind of account do you need?</p>
      <div className="login-role-grid">
        <button type="button" className="login-role" onClick={() => onPick('driver')}>
          <strong>Driver</strong>
          <span>Earn points for safe driving.</span>
        </button>
        <button type="button" className="login-role" onClick={() => onPick('sponsor')}>
          <strong>Sponsor</strong>
          <span>Manage drivers at your company.</span>
        </button>
      </div>
    </div>
  );
}

function RoleRegistrationForm({ role, onBack, onDone }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const validate = () => {
    if (!firstName.trim()) return 'Enter your first name.';
    if (!lastName.trim()) return 'Enter your last name.';
    if (!email.trim()) return 'Enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (!username.trim()) return 'Enter a username.';
    if (!password) return 'Enter a password.';
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
    if (password !== passwordConfirm) return 'Passwords do not match.';
    if (role === 'sponsor' && !companyName.trim()) return 'Enter a company name.';
    return null;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
      };
      if (role === 'sponsor') {
        payload.company_name = companyName.trim();
      }
      const created = role === 'sponsor'
        ? await api.registerSponsor(payload)
        : await api.registerDriver(payload);
      const accountLabel = ROLE_LABEL[role];
      const companyPart = role === 'sponsor' && created && created.company
        ? ` Company: ${created.company}.`
        : '';
      onDone(
        `✓ ${accountLabel} account created successfully.`
        + `${companyPart}`
        + ` You can now sign in with your username and password.`
      );
    } catch (err) {
      setError(err.message || 'Account could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <div className="login-form-head">
        <h2>Create a {ROLE_LABEL[role]} Account</h2>
        <button type="button" className="login-back" onClick={onBack}>Back</button>
      </div>

      {error && <p className="login-alert login-alert-error" role="alert">{error}</p>}

      <div className="login-field">
        <label htmlFor="reg-first-name">First Name</label>
        <input
          id="reg-first-name"
          className="login-input"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          autoComplete="given-name"
        />
      </div>

      <div className="login-field">
        <label htmlFor="reg-last-name">Last Name</label>
        <input
          id="reg-last-name"
          className="login-input"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          autoComplete="family-name"
        />
      </div>

      <div className="login-field">
        <label htmlFor="reg-email">Email</label>
        <input
          id="reg-email"
          type="email"
          className="login-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="login-field">
        <label htmlFor="reg-username">Username</label>
        <input
          id="reg-username"
          className="login-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
        />
      </div>

      <div className="login-field">
        <label htmlFor="reg-password">Password</label>
        <input
          id="reg-password"
          type="password"
          className="login-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="login-field">
        <label htmlFor="reg-password-confirm">Confirm Password</label>
        <input
          id="reg-password-confirm"
          type="password"
          className="login-input"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          autoComplete="new-password"
        />
      </div>

      {role === 'sponsor' && (
        <div className="login-field">
          <label htmlFor="reg-company">Company Name</label>
          <input
            id="reg-company"
            className="login-input"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            autoComplete="organization"
          />
        </div>
      )}

      <button className="login-btn" type="submit" disabled={busy}>
        {busy ? 'Creating account…' : `Create ${ROLE_LABEL[role]} Account`}
      </button>
    </form>
  );
}
