import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import * as api from '../../api';
import BrandMark from '../../components/branding/BrandMark';
import ProgramPerks from '../../components/branding/ProgramPerks';
import RoadTruck from '../../components/branding/RoadTruck';
import PasswordInput from '../../components/forms/PasswordInput';
import PasswordRequirements from '../../components/forms/PasswordRequirements';
import { useAuth } from '../../auth/AuthContext';
import {
  validateEmail,
  validateName,
  validatePassword,
  validateUsername,
} from '../../utils/accountValidation';
import './LoginPage.css';

const ROLE_LABEL = { driver: 'Driver', sponsor: 'Sponsor' };
const HEALTH_POLL_MS = 10000;
const OUTAGE_MESSAGE = "We can't reach the Good Driver server right now. Check your connection, or try again in a minute.";

/** Error text for a failed request, replacing raw network errors like "Failed to fetch". */
function requestErrorMessage(err, fallback) {
  return api.isOutageError(err) ? OUTAGE_MESSAGE : (err.message || fallback);
}

function PasswordField({ id, label, className = 'login-input', invalid, describedBy, children, ...inputProps }) {
  return (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>
      <PasswordInput
        id={id}
        label={label}
        className={className}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {children}
    </div>
  );
}

export default function LoginPage() {
  const { loading, user, notice, signIn, completeMfaLogin, requestMfaLoginCode } = useAuth();
  const release = useCurrentRelease();
  const [crashKey, setCrashKey] = useState(0);
  const [serverDown, setServerDown] = useState(false);
  const crashTruck = useCallback(() => setCrashKey((count) => count + 1), []);
  const wreckTruck = useCallback(() => setServerDown(true), []);

  // While the server is unreachable the truck stays wrecked; check back
  // periodically and put it back on the road once the backend answers.
  useEffect(() => {
    if (!serverDown) return undefined;
    const timer = setInterval(async () => {
      if (await api.checkHealth()) setServerDown(false);
    }, HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [serverDown]);

  let content;
  if (loading) {
    content = <LoadingCard />;
  } else if (user) {
    content = <Navigate to="/" replace />;
  } else {
    content = (
      <AuthCard
        sessionExpired={notice === 'expired'}
        onSignIn={signIn}
        onMfaComplete={completeMfaLogin}
        onRequestMfaCode={requestMfaLoginCode}
        onError={crashTruck}
        onOutage={wreckTruck}
      />
    );
  }

  return (
    <div className="login-page">
      <aside className="login-road">
        <div className="login-brand">
          <BrandMark className="login-brand-mark" onDark />
          <span className="login-brand-name">Good Driver</span>
        </div>
        <div className="login-pitch">
          <h1>Safe miles add up to real rewards.</h1>
          <p>Your sponsor company gives you points for driving well. Sign in to check your balance and see what you can redeem.</p>
          <ProgramPerks className="login-perks" />
        </div>
        <RoadTruck className="login-lane" crashKey={crashKey} wrecked={serverDown} />
        <div className="login-road-foot">
          {release && <span>Team {release.team_number}, {release.version_number}</span>}
          <Link to="/about">About this app</Link>
        </div>
      </aside>

      <main className="login-side" aria-label="Sign in page">
        {content}
      </main>
    </div>
  );
}

// Same release record the About page shows; the footer omits it until loaded.
function useCurrentRelease() {
  const [release, setRelease] = useState(null);
  useEffect(() => {
    let active = true;
    api.currentRelease()
      .then((data) => {
        if (active) setRelease(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return release;
}

function LoadingCard() {
  return (
    <div className="login-card" role="status">
      <p className="login-loading">Checking your session…</p>
    </div>
  );
}

const SESSION_EXPIRED_NOTICE = 'You were signed out due to inactivity. Sign in again to continue.';

function AuthCard({ sessionExpired = false, onSignIn, onMfaComplete, onRequestMfaCode, onError, onOutage }) {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState(() => (
    searchParams.get('tab') === 'register' ? 'signup' : 'signin'
  ));
  const [role, setRole] = useState(null);
  const [notice, setNotice] = useState(sessionExpired ? SESSION_EXPIRED_NOTICE : null);

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

      {view === 'signin' && <LoginForm onSignIn={onSignIn} onMfaComplete={onMfaComplete} onRequestMfaCode={onRequestMfaCode} onError={onError} onOutage={onOutage} />}

      {view === 'signup' && role === null && <RoleChoice onPick={setRole} />}

      {view === 'signup' && role === 'driver' && (
        <RoleRegistrationForm role="driver" onBack={() => setRole(null)} onDone={handleRegistered} onError={onError} onOutage={onOutage} />
      )}

      {view === 'signup' && role === 'sponsor' && (
        <RoleRegistrationForm role="sponsor" onBack={() => setRole(null)} onDone={handleRegistered} onError={onError} onOutage={onOutage} />
      )}
    </div>
  );
}

const METHOD_LABEL = {
  totp: 'Authenticator app',
  email: 'Email code',
  sms: 'Text message',
  backup: 'Backup code',
};

function LoginForm({ onSignIn, onMfaComplete, onRequestMfaCode, onError, onOutage }) {
  const [step, setStep] = useState('creds');
  const [mfaMethods, setMfaMethods] = useState([]);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [method, setMethod] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  // Set when the server rejects the username/password pair, so both fields are
  // highlighted (the response deliberately does not say which one was wrong).
  const [credentialsRejected, setCredentialsRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRefs = useRef([]);

  // Easter egg: tell the page so the road truck crashes whenever an error shows.
  useEffect(() => {
    if (error) onError?.();
  }, [error, onError]);

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
      setError(requestErrorMessage(err, 'Could not send the verification code.'));
      if (api.isOutageError(err)) onOutage?.();
    } finally {
      setSendingCode(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setCredentialsRejected(false);
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
        setBackupAvailable((result.mfa.backup_codes_remaining || 0) > 0);
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
      setError(requestErrorMessage(err, 'Invalid username or password.'));
      if (api.isOutageError(err)) onOutage?.();
      setCredentialsRejected(true);
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
    if (chosen !== 'totp' && chosen !== 'backup') await sendLoginCode(chosen);
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setError(null);
    if (!method) {
      setError('Choose a verification method.');
      return;
    }
    if (method === 'backup' && !code.trim()) {
      setError('Enter your code.');
      return;
    }
    if (method !== 'backup' && code.replace(/\D/g, '').length !== 6) {
      setError('Enter all 6 digits.');
      return;
    }
    setBusy(true);
    try {
      await onMfaComplete(method, method === 'backup' ? code.trim() : code.replace(/\D/g, ''));
    } catch (err) {
      setError(requestErrorMessage(err, 'Invalid code.'));
      if (api.isOutageError(err)) onOutage?.();
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = () => {
    if (method && method !== 'totp' && method !== 'backup' && !sendingCode && cooldown <= 0) {
      sendLoginCode(method);
    }
  };

  const useBackupCode = () => {
    setMethod('backup');
    setCode('');
    setError(null);
    setStep('code');
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

  const updateCodeDigit = (index, value) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      const next = code.padEnd(6, ' ').split('');
      next[index] = ' ';
      setCode(next.join('').trimEnd());
      return;
    }

    // Password managers and mobile one-time-code autofill may put all six
    // digits into the focused box, so distribute them across the row.
    if (digits.length > 1) {
      const pastedCode = digits.slice(0, 6);
      setCode(pastedCode);
      codeInputRefs.current[Math.min(pastedCode.length, 6) - 1]?.focus();
      return;
    }

    const next = code.padEnd(6, ' ').split('');
    next[index] = digits;
    setCode(next.join('').trimEnd());
    codeInputRefs.current[index + 1]?.focus();
  };

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

        {backupAvailable && (
          <button className="login-btn login-btn-outline" type="button" onClick={useBackupCode} disabled={busy}>
            Use a backup code instead
          </button>
        )}

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
          {method === 'backup'
            ? 'Enter one of your saved backup codes.'
            : method && method !== 'totp'
              ? `Your ${method === 'sms' ? 'text message' : 'email'} code was sent to your ${method === 'sms' ? 'phone' : 'account email'}. Your sign-in times out after 5 minutes, so re-enter your password if it expires.`
              : 'Enter the code from your authenticator app. Your sign-in times out after 5 minutes, so re-enter your password if it expires.'}
        </p>

        {error && <p className="login-alert login-alert-error" role="alert">{error}</p>}

        {method && method !== 'totp' && method !== 'backup' && (
          <button className="login-btn login-btn-outline" type="button" onClick={resend} disabled={sendingCode || cooldown > 0}>
            {sendingCode ? 'Sending…' : cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
          </button>
        )}

        {method === 'backup' ? (
          <div className="login-field">
            <label htmlFor="login-mfa-code">Backup code</label>
            <input
              id="login-mfa-code"
              className={fieldClass(error && !code.trim())}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="text"
              autoComplete="one-time-code"
            />
          </div>
        ) : (
          <fieldset className="login-code-field">
            <legend>Verification code</legend>
            <div className="login-code-groups">
              {Array.from({ length: 6 }, (_, index) => (
                <input
                  key={index}
                  ref={(element) => { codeInputRefs.current[index] = element; }}
                  className={`${fieldClass(error && code.replace(/\D/g, '').length !== 6)} login-code-digit`}
                  value={(code[index] || '').trim()}
                  onChange={(event) => updateCodeDigit(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !code[index] && index > 0) {
                      codeInputRefs.current[index - 1]?.focus();
                    }
                    if (event.key === 'ArrowLeft' && index > 0) codeInputRefs.current[index - 1]?.focus();
                    if (event.key === 'ArrowRight' && index < 5) codeInputRefs.current[index + 1]?.focus();
                  }}
                  aria-label={`Verification code digit ${index + 1}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={index === 0 ? 6 : 1}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                />
              ))}
            </div>
            <small>Enter all six digits; no space is needed.</small>
          </fieldset>
        )}

        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify and sign in'}
        </button>
        {backupAvailable && method !== 'backup' && (
          <button className="login-btn login-btn-outline" type="button" onClick={useBackupCode} disabled={busy}>
            Use a backup code instead
          </button>
        )}
        <button className="login-btn login-btn-outline" type="button" onClick={backFromCode} disabled={busy}>
          Back
        </button>
      </form>
    );
  }

  const usernameInvalid = Boolean(credentialsRejected || (error && !username.trim()));
  const passwordInvalid = Boolean(credentialsRejected || (error && !password));

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <h2>Sign in</h2>
      <p className="login-sub">Use the username and password from your account.</p>

      {error && <p id="login-error" className="login-alert login-alert-error" role="alert">{error}</p>}

      <div className="login-field">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          className={fieldClass(usernameInvalid)}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setCredentialsRejected(false);
          }}
          aria-invalid={usernameInvalid || undefined}
          aria-describedby={usernameInvalid ? 'login-error' : undefined}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck="false"
        />
      </div>

      <PasswordField
        id="login-password"
        label="Password"
        className={fieldClass(passwordInvalid)}
        invalid={passwordInvalid}
        describedBy={passwordInvalid ? 'login-error' : undefined}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setCredentialsRejected(false);
        }}
        autoComplete="current-password"
      />

      <button className="login-btn" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
      <p className="login-help">
        <Link className="login-link" to="/forgot-password">Forgot password?</Link>
      </p>
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

function RoleRegistrationForm({ role, onBack, onDone, onError, onOutage }) {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // When an admin requires email verification, the first submit emails a code
  // and the same details are resubmitted with that code to create the account.
  const [step, setStep] = useState('details');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeNotice, setCodeNotice] = useState(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Easter egg: tell the page so the road truck crashes whenever an error shows.
  useEffect(() => {
    if (error) onError?.();
  }, [error, onError]);

  const validate = () => {
    const fieldProblem = validateName(firstName, 'first name')
      || validateName(lastName, 'last name')
      || validateEmail(email)
      || validateUsername(username)
      || validatePassword(password, { username, email });
    if (fieldProblem) return fieldProblem;
    if (password !== passwordConfirm) return 'Passwords do not match.';
    if (role === 'sponsor' && !companyName.trim()) return 'Enter a company name.';
    if (!acceptedTerms) return 'Accept the program terms and privacy notice to create an account.';
    return null;
  };

  const register = (extra = {}) => {
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      username: username.trim(),
      password,
      password_confirm: passwordConfirm,
      accepted_terms: acceptedTerms,
      ...extra,
    };
    if (role === 'sponsor') {
      payload.company_name = companyName.trim();
    }
    return role === 'sponsor' ? api.registerSponsor(payload) : api.registerDriver(payload);
  };

  const finishRegistration = (created) => {
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
      const result = await register();
      if (result && result.verification_required) {
        setVerifyEmail(result.email || email.trim());
        setCode('');
        setCodeNotice(null);
        setCooldown(30);
        setStep('verify');
        return;
      }
      finishRegistration(result);
    } catch (err) {
      setError(requestErrorMessage(err, 'Account could not be created.'));
      if (api.isOutageError(err)) onOutage?.();
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();
    setError(null);
    setCodeNotice(null);
    if (!code.trim()) {
      setError('Enter the verification code from your email.');
      return;
    }
    setBusy(true);
    try {
      finishRegistration(await register({ code: code.trim() }));
    } catch (err) {
      setError(err.message || 'Account could not be created.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (sendingCode || cooldown > 0) return;
    setSendingCode(true);
    setError(null);
    setCodeNotice(null);
    try {
      await register();
      setCodeNotice('A new code was sent.');
      setCooldown(30);
    } catch (err) {
      setError(err.message || 'Could not send the verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  const backToDetails = () => {
    setStep('details');
    setError(null);
    setCodeNotice(null);
    setCode('');
  };

  if (step === 'verify') {
    return (
      <form className="login-form" onSubmit={submitCode} noValidate>
        <div className="login-form-head">
          <h2>Verify your email</h2>
          <button type="button" className="login-back" onClick={backToDetails} disabled={busy}>Back</button>
        </div>
        <p className="login-sub">
          We sent a verification code to <strong>{verifyEmail}</strong>. Enter it below to
          create your {ROLE_LABEL[role]} account. The code expires in 10 minutes.
        </p>

        {error && <p className="login-alert login-alert-error" role="alert">{error}</p>}
        {codeNotice && <p className="login-alert login-alert-success" role="status">{codeNotice}</p>}

        <div className="login-field">
          <label htmlFor="reg-verification-code">Verification code</label>
          <input
            id="reg-verification-code"
            className={error && !code.trim() ? 'login-input login-input-error' : 'login-input'}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </div>

        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify and create account'}
        </button>
        <button className="login-btn login-btn-outline" type="button" onClick={resendCode} disabled={busy || sendingCode || cooldown > 0}>
          {sendingCode ? 'Sending…' : cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
        </button>
      </form>
    );
  }

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

      <PasswordField id="reg-password" label="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
      <PasswordRequirements />

      <PasswordField id="reg-password-confirm" label="Confirm Password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" />

      <label className="login-consent">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
        />
        <span>
          I agree to the{' '}
          <Link to="/terms" target="_blank" rel="noreferrer">Terms of Service</Link>
          {' '}and acknowledge the{' '}
          <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Notice</Link>.
        </span>
      </label>

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
