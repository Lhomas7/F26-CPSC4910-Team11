import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import * as api from '../config/api';
import { useAuth } from '../auth/AuthContext';
import './LoginPage.css';

const ROLE_LABEL = { driver: 'Driver', sponsor: 'Sponsor' };

function PasswordInput({ id, label, value, onChange, autoComplete, className = 'login-input' }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>
      <div className="login-password-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={className}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { loading, user, signIn, completeMfaLogin, requestMfaLoginCode, signOut } = useAuth();

  let content;
  if (loading) {
    content = <LoadingCard />;
  } else if (user) {
    content = <LoggedInCard user={user} onSignOut={signOut} />;
  } else {
    content = <AuthCard onSignIn={signIn} onMfaComplete={completeMfaLogin} onRequestMfaCode={requestMfaLoginCode} />;
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

function AuthCard({ onSignIn, onMfaComplete, onRequestMfaCode }) {
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

      {view === 'signin' && <LoginForm onSignIn={onSignIn} onMfaComplete={onMfaComplete} onRequestMfaCode={onRequestMfaCode} />}

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

const METHOD_LABEL = { totp: 'Authenticator app', email: 'Email code', sms: 'Text message' };

function LoginForm({ onSignIn, onMfaComplete, onRequestMfaCode }) {
  const [step, setStep] = useState('creds');
  const [mfaMethods, setMfaMethods] = useState([]);
  const [method, setMethod] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendLoginCode = async (chosen) => {
    setSendingCode(true);
    setError(null);
    try {
      await onRequestMfaCode(chosen);
      setCooldown(30);
    } catch (err) {
      setError(err.message || 'Could not send the verification code.');
    } finally {
      setSendingCode(false);
    }
  };

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
      const result = await onSignIn(username.trim(), password);
      if (result && result.mfa && result.mfa.methods && result.mfa.methods.length > 0) {
        const methods = result.mfa.methods;
        setMfaMethods(methods);
        setPassword('');
        setCode('');
        if (methods.length === 1) {
          const only = methods[0];
          setMethod(only);
          setStep('code');
          if (only !== 'totp') await sendLoginCode(only);
        } else {
          setMethod(null);
          setStep('select');
        }
      }
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const chooseMethod = async (chosen) => {
    setMethod(chosen);
    setCode('');
    setError(null);
    setStep('code');
    if (chosen !== 'totp') await sendLoginCode(chosen);
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setError(null);
    if (!method) {
      setError('Choose a verification method.');
      return;
    }
    if (!code.trim()) {
      setError('Enter your code.');
      return;
    }
    setBusy(true);
    try {
      await onMfaComplete(method, code.trim());
    } catch (err) {
      setError(err.message || 'Invalid code.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = () => {
    if (method && method !== 'totp' && !sendingCode && cooldown <= 0) {
      sendLoginCode(method);
    }
  };

  const backToCredentials = () => {
    setStep('creds');
    setError(null);
    setCode('');
    setMethod(null);
  };

  const backFromCode = () => {
    setError(null);
    setCode('');
    if (mfaMethods.length > 1) {
      setMethod(null);
      setStep('select');
    } else {
      backToCredentials();
    }
  };

  const fieldClass = (bad) => bad ? 'login-input login-input-error' : 'login-input';

  if (step === 'select') {
    return (
      <form className="login-form" onSubmit={(event) => event.preventDefault()} noValidate>
        <h2>Two-step verification</h2>
        <p className="login-sub">Choose a method to receive your verification code.</p>

        {error && <p className="login-alert login-alert-error" role="alert">{error}</p>}

        <div className="login-role-grid">
          {mfaMethods.map((m) => (
            <button key={m} type="button" className="login-role" onClick={() => chooseMethod(m)} disabled={busy}>
              <strong>{METHOD_LABEL[m] || m}</strong>
              <span>
                {m === 'totp'
                  ? 'Use your authenticator app'
                  : m === 'sms'
                    ? 'Get a code by text message'
                    : 'Get a code by email'}
              </span>
            </button>
          ))}
        </div>

        <button className="login-btn login-btn-outline" type="button" onClick={backToCredentials} disabled={busy}>
          Back
        </button>
      </form>
    );
  }

  if (step === 'code') {
    return (
      <form className="login-form" onSubmit={submitCode} noValidate>
        <h2>Two-step verification</h2>
        <p className="login-sub">
          {method && method !== 'totp'
            ? `Your ${method === 'sms' ? 'text message' : 'email'} code was sent to your ${method === 'sms' ? 'phone' : 'account email'}. Your sign-in times out after 5 minutes, so re-enter your password if it expires.`
            : 'Enter the code from your authenticator app. Your sign-in times out after 5 minutes, so re-enter your password if it expires.'}
        </p>

        {error && <p className="login-alert login-alert-error" role="alert">{error}</p>}

        {method && method !== 'totp' && (
          <button className="login-btn login-btn-outline" type="button" onClick={resend} disabled={sendingCode || cooldown > 0}>
            {sendingCode ? 'Sending…' : cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
          </button>
        )}

        <div className="login-field">
          <label htmlFor="login-mfa-code">Verification code</label>
          <input
            id="login-mfa-code"
            className={fieldClass(error && !code.trim())}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </div>

        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify and sign in'}
        </button>
        <button className="login-btn login-btn-outline" type="button" onClick={backFromCode} disabled={busy}>
          Back
        </button>
      </form>
    );
  }

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

      <PasswordInput
        id="login-password"
        label="Password"
        className={fieldClass(error && !password)}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
      />

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
  const { updateUser } = useAuth();
  const navigate = useNavigate();
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
      if (role === 'sponsor') {
        // Sponsors finish MFA setup before the account is usable; land them on
        // the onboarding wall (SiteLayout gates the app until they enroll).
        updateUser(created);
        navigate('/');
        return;
      }
      const accountLabel = ROLE_LABEL[role];
      onDone(
        `✓ ${accountLabel} account created successfully.`
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

      <PasswordInput id="reg-password" label="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />

      <PasswordInput id="reg-password-confirm" label="Confirm Password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" />

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
