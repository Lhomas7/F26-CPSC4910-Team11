import { useState } from 'react';

import * as api from '../config/api';
import './AccountPage.css';

const METHOD_LABELS = {
  email: { title: 'Email code', hint: 'A verification code is sent to your account email.' },
  sms: { title: 'Text message', hint: 'A verification code is sent to your phone.' },
  totp: { title: 'Authenticator app', hint: 'Use a time-based code from your authenticator app.' },
};

export default function MfaPanel({ mfa, onRefreshed, requiredText, hideRequiredBanner }) {
  const requiredMessage = requiredText || 'Your sponsor requires you to set up two-factor authentication before continuing.';
  const [flow, setFlow] = useState(null);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(null);

  const reset = () => {
    setFlow(null);
    setCode('');
    setPhone('');
    setPassword('');
    setMessage(null);
  };

  const startEnable = async (method) => {
    setMessage(null);
    let phoneNumber;
    if (method === 'sms') {
      if (!phone.trim()) {
        setMessage({ ok: false, text: 'Enter your phone number first (E.164 format, e.g. +18645551234).' });
        return;
      }
      phoneNumber = phone.trim();
    }
    setBusy(method);
    try {
      const payload = await api.mfaSetup(method, phoneNumber);
      setFlow({ method, stage: 'verify', payload: method === 'totp' ? payload : null });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();
    if (!code.trim()) {
      setMessage({ ok: false, text: 'Enter the code you received.' });
      return;
    }
    setMessage(null);
    setBusy('verify');
    try {
      await api.mfaVerify(flow.method, code.trim());
      setMessage({ ok: true, text: `${METHOD_LABELS[flow.method].title} enabled.` });
      reset();
      onRefreshed();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
      setCode('');
    } finally {
      setBusy(null);
    }
  };

  const startReset = async () => {
    setMessage(null);
    const fallback = ['email', 'sms'].find((m) => mfa.methods.includes(m));
    if (!fallback) {
      setMessage({ ok: false, text: 'Enable email or text message MFA first — you need it as the reset fallback.' });
      return;
    }
    setBusy('reset');
    try {
      await api.mfaRequestCode('reset', fallback);
      setFlow({ method: fallback, stage: 'reset' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    if (!code.trim()) {
      setMessage({ ok: false, text: 'Enter the fallback code you received.' });
      return;
    }
    setMessage(null);
    setBusy('reset');
    try {
      const payload = await api.mfaReset(flow.method, code.trim());
      setFlow({ method: flow.method, stage: 'reset-done', payload });
      setCode('');
      onRefreshed();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
      setCode('');
    } finally {
      setBusy(null);
    }
  };

  const disable = async (method) => {
    if (!password) {
      setMessage({ ok: false, text: 'Enter your current password to disable a method.' });
      return;
    }
    setMessage(null);
    setBusy(method);
    try {
      await api.mfaDisable(method, password);
      setPassword('');
      setMessage({ ok: true, text: `${METHOD_LABELS[method].title} disabled.` });
      onRefreshed();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const methodRows = ['email', 'sms', 'totp'].map((m) => ({
    ...METHOD_LABELS[m],
    key: m,
    enabled: mfa.methods.includes(m),
  }));

  return (
    <section className="account-card" aria-labelledby="mfa-heading">
      <div className="account-card-header">
        <div><h2 id="mfa-heading">Two-factor authentication</h2><p>Add an extra layer of protection when you sign in</p></div>
      </div>

      {!hideRequiredBanner && mfa.required && !mfa.enrolled && (
        <p className="account-banner error" role="status">
          {requiredMessage}
        </p>
      )}

      {message && (
        <p className={message.ok ? 'account-banner success' : 'account-banner error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}

      {flow && flow.stage === 'verify' && flow.method === 'totp' && flow.payload && (
        <div className="mfa-setup-block">
          <p>Scan this QR code with your authenticator app, or enter the manual key below.</p>
          <img className="mfa-qr" src={flow.payload.qr_code} alt="QR code to add to your authenticator app" />
          <p className="mfa-manual-key">
            Manual key: <code>{flow.payload.manual_key}</code>
          </p>
          <form className="password-form" onSubmit={submitCode} noValidate>
            <label htmlFor="mfa-verify-code">Enter a code from your authenticator app</label>
            <input id="mfa-verify-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
            <div className="account-card-footer">
              <button className="account-button" type="button" onClick={reset} disabled={busy === 'verify'}>Cancel</button>
              <button className="account-button primary" type="submit" disabled={busy === 'verify'}>{busy === 'verify' ? 'Verifying…' : 'Verify and enable'}</button>
            </div>
          </form>
        </div>
      )}

      {flow && flow.stage === 'verify' && flow.method !== 'totp' && (
        <div className="mfa-setup-block">
          <p>A verification code was sent to {flow.method === 'sms' ? 'your phone' : 'your email'}. Enter it below to turn this method on.</p>
          <form className="password-form" onSubmit={submitCode} noValidate>
            <label htmlFor="mfa-verify-code">Verification code</label>
            <input id="mfa-verify-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
            <div className="account-card-footer">
              <button className="account-button" type="button" onClick={reset} disabled={busy === 'verify'}>Cancel</button>
              <button className="account-button primary" type="submit" disabled={busy === 'verify'}>{busy === 'verify' ? 'Verifying…' : 'Verify and enable'}</button>
            </div>
          </form>
        </div>
      )}

      {flow && flow.stage === 'reset' && (
        <div className="mfa-setup-block">
          <p>A reset code was sent via {METHOD_LABELS[flow.method].title}. Enter it to rotate your authenticator app secret.</p>
          <form className="password-form" onSubmit={submitReset} noValidate>
            <label htmlFor="mfa-verify-code">Reset code</label>
            <input id="mfa-verify-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
            <div className="account-card-footer">
              <button className="account-button" type="button" onClick={reset} disabled={busy === 'reset'}>Cancel</button>
              <button className="account-button primary" type="submit" disabled={busy === 'reset'}>{busy === 'reset' ? 'Resetting…' : 'Reset authenticator app'}</button>
            </div>
          </form>
        </div>
      )}

      {flow && flow.stage === 'reset-done' && flow.payload && (
        <div className="mfa-setup-block">
          <p>Your authenticator app secret was rotated. Scan the new QR code (or add the manual key) in your app.</p>
          <img className="mfa-qr" src={flow.payload.qr_code} alt="New QR code for your authenticator app" />
          <p className="mfa-manual-key">
            Manual key: <code>{flow.payload.manual_key}</code>
          </p>
          <button className="account-button" type="button" onClick={reset}>Done</button>
        </div>
      )}

      {!flow && (
        <>
          <div className="mfa-methods">
            {methodRows.map((row) => (
              <div className="mfa-method" key={row.key}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.hint}</p>
                </div>
                <div className="mfa-method-actions">
                  {row.enabled ? (
                    <>
                      <span className="mfa-pill">Enabled</span>
                      <button className="account-button" type="button" onClick={() => disable(row.key)} disabled={busy === row.key}>
                        {busy === row.key ? 'Disabling…' : 'Disable'}
                      </button>
                    </>
                  ) : (
                    <button className="account-button primary" type="button" onClick={() => startEnable(row.key)} disabled={busy === row.key}>
                      {row.key === 'totp' ? 'Set up' : 'Turn on'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!mfa.methods.includes('sms') && (
            <div className="password-form">
              <label htmlFor="mfa-sms-phone">Phone number (for text message codes)</label>
              <input id="mfa-sms-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+18645551234" autoComplete="tel" />
            </div>
          )}
          {mfa.enrolled && (
            <>
              <div className="password-form">
                <label htmlFor="mfa-disable-password">Current password (required to disable a method)</label>
                <input id="mfa-disable-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
              </div>
              {mfa.methods.includes('totp') && (
                <div className="account-card-footer">
                  <button className="account-button" type="button" onClick={startReset} disabled={busy === 'reset'}>
                    {busy === 'reset' ? 'Requesting…' : 'Reset authenticator app'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}