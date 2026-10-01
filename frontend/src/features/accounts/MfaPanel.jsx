import { useState } from 'react';

import * as api from '../../api';
import COUNTRY_CODES from '../../data/countryCodes';
import './AccountPage.css';

const METHOD_LABELS = {
  email: { title: 'Email code', hint: 'A verification code is sent to your account email.' },
  sms: { title: 'Text message', hint: 'A verification code is sent to your phone.' },
  totp: { title: 'Authenticator app', hint: 'Use a time-based code from your authenticator app.' },
};

function formatNationalNumber(digits, countryCode) {
  if (countryCode === '+1') {
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
    if (digits.length <= 3) return parts[0];
    if (digits.length <= 6) return `(${parts[0]}) ${parts[1]}`;
    return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
  }
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function copyCodes(codes) {
  const text = codes.join('\n');
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error('Clipboard is not available.'));
}

function BackupCodesReveal({ codes, onDone }) {
  const [copyMessage, setCopyMessage] = useState(null);

  const copy = async () => {
    try {
      await copyCodes(codes);
      setCopyMessage('Copied to clipboard.');
    } catch {
      setCopyMessage('Could not copy automatically — select and copy the codes below.');
    }
  };

  return (
    <div className="mfa-setup-block">
      <p>
        Save these backup codes somewhere safe. Each one can be used once to
        sign in if you lose access to your normal two-factor method.
      </p>
      <textarea
        className="mfa-backup-codes"
        readOnly
        aria-label="Backup codes"
        value={codes.join('\n')}
        onFocus={(event) => event.target.select()}
        rows={codes.length}
      />
      {copyMessage && <p className="account-banner success" role="status">{copyMessage}</p>}
      <div className="account-card-footer">
        <button className="account-button" type="button" onClick={copy}>Copy codes</button>
        <button className="account-button primary" type="button" onClick={onDone}>
          Done — I saved these codes
        </button>
      </div>
    </div>
  );
}

export default function MfaPanel({ mfa, onRefreshed, requiredText, hideRequiredBanner }) {
  const requiredMessage = requiredText || 'Your sponsor requires you to set up two-factor authentication before continuing.';
  const allowedMethods = mfa.allowed_methods || ['email', 'sms', 'totp'];
  const [flow, setFlow] = useState(null);
  const [code, setCode] = useState('');
  const [countryIso, setCountryIso] = useState('US');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(null);
  const [setupMethod, setSetupMethod] = useState(mfa.default_method || allowedMethods[0]);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [revealCodes, setRevealCodes] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState('');

  const reset = () => {
    setFlow(null);
    setCode('');
    setPhoneDigits('');
    setPassword('');
    setMessage(null);
  };

  const startEnable = async (method) => {
    setMessage(null);
    let phoneNumber;
    if (method === 'sms') {
      const country = COUNTRY_CODES.find((option) => option.code === countryIso);
      const nationalNumber = country.dialCode === '+1' ? phoneDigits : phoneDigits.replace(/^0+/, '');
      if (nationalNumber.length !== country.nationalNumberLength) {
        setMessage({ ok: false, text: 'Enter a valid phone number.' });
        return;
      }
      phoneNumber = `${country.dialCode}${nationalNumber}`;
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
      const result = await api.mfaVerify(flow.method, code.trim());
      reset();
      if (result.backup_codes) {
        // Defer onRefreshed(): some parents (the admin/sponsor setup wall)
        // unmount this panel the moment mfa.enrolled flips to true, which
        // would tear down this reveal screen before the codes are seen.
        setRevealCodes(result.backup_codes);
      } else {
        setMessage({ ok: true, text: `${METHOD_LABELS[flow.method].title} enabled.` });
        onRefreshed();
      }
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
    if (fallback) {
      setBusy('reset');
      try {
        await api.mfaRequestCode('reset', fallback);
        setFlow({ method: fallback, stage: 'reset' });
      } catch (err) {
        setMessage({ ok: false, text: err.message });
      } finally {
        setBusy(null);
      }
      return;
    }
    if (mfa.backup_codes_remaining > 0) {
      setFlow({ method: 'backup', stage: 'reset' });
      return;
    }
    setMessage({
      ok: false,
      text: 'Enable email or text message MFA, or use a backup code, to reset your authenticator app.',
    });
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

  const submitRegenerate = async () => {
    if (!regeneratePassword) {
      setMessage({ ok: false, text: 'Enter your current password to regenerate backup codes.' });
      return;
    }
    setMessage(null);
    setBusy('regenerate');
    try {
      const result = await api.mfaBackupCodesRegenerate(regeneratePassword);
      setRegenerating(false);
      setRegeneratePassword('');
      setRevealCodes(result.backup_codes);
      onRefreshed();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const methodRows = allowedMethods.map((m) => ({
    ...METHOD_LABELS[m],
    key: m,
    enabled: mfa.methods.includes(m),
  }));
  const selectedCountry = COUNTRY_CODES.find((country) => country.code === countryIso)
    || COUNTRY_CODES.find((country) => country.code === 'US');
  const otherMethods = allowedMethods.filter((m) => m !== setupMethod);

  if (revealCodes) {
    return (
      <section className="account-card" aria-labelledby="mfa-heading">
        <div className="account-card-header">
          <div><h2 id="mfa-heading">Two-factor authentication</h2><p>Save your backup codes</p></div>
        </div>
        <BackupCodesReveal
          codes={revealCodes}
          onDone={() => { setRevealCodes(null); onRefreshed(); }}
        />
      </section>
    );
  }

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
          <p>
            {flow.method === 'backup'
              ? 'Enter one of your unused backup codes to rotate your authenticator app secret.'
              : `A reset code was sent via ${METHOD_LABELS[flow.method].title}. Enter it to rotate your authenticator app secret.`}
          </p>
          <form className="password-form" onSubmit={submitReset} noValidate>
            <label htmlFor="mfa-verify-code">{flow.method === 'backup' ? 'Backup code' : 'Reset code'}</label>
            <input id="mfa-verify-code" inputMode={flow.method === 'backup' ? 'text' : 'numeric'} value={code} onChange={(event) => setCode(event.target.value)} />
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

      {!flow && !mfa.enrolled && (
        <>
          <div className="mfa-method">
            <div>
              <strong>Not set up</strong>
              <p>{METHOD_LABELS[setupMethod].hint}</p>
            </div>
            {setupMethod !== 'sms' && (
              <div className="mfa-method-actions">
                <button
                  className="account-button primary"
                  type="button"
                  onClick={() => startEnable(setupMethod)}
                  disabled={busy === setupMethod}
                >
                  {busy === setupMethod ? 'Starting…' : 'Set up 2FA'}
                </button>
              </div>
            )}
          </div>

          {setupMethod === 'sms' && (
            <div className="password-form">
              <label htmlFor="mfa-sms-phone">Phone number (for text message codes)</label>
              <div className="mfa-phone-input">
                <label className="sr-only" htmlFor="mfa-country-code">Country code</label>
                <select id="mfa-country-code" value={countryIso} onChange={(event) => { setCountryIso(event.target.value); setPhoneDigits(''); }}>
                  {COUNTRY_CODES.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.dialCode})</option>)}
                </select>
                <input
                  id="mfa-sms-phone"
                  value={formatNationalNumber(phoneDigits, selectedCountry.dialCode)}
                  onChange={(event) => setPhoneDigits(event.target.value.replace(/\D/g, '').slice(0, selectedCountry.nationalNumberLength + (selectedCountry.dialCode === '+1' ? 0 : 1)))}
                  placeholder={selectedCountry.code === 'US' ? '(864) 555-1234' : 'Phone number'}
                  inputMode="tel"
                  autoComplete="tel-national"
                />
              </div>
              <small>The country code is added automatically when the number is saved.</small>
              <div className="account-card-footer">
                <button className="account-button primary" type="button" onClick={() => startEnable('sms')} disabled={busy === 'sms'}>
                  {busy === 'sms' ? 'Starting…' : 'Turn on text message codes'}
                </button>
              </div>
            </div>
          )}

          {otherMethods.length > 0 && (
            <div className="password-form">
              {!showMethodPicker ? (
                <button className="account-link-button" type="button" onClick={() => setShowMethodPicker(true)}>
                  Set up a different method instead
                </button>
              ) : (
                <>
                  <label htmlFor="mfa-method-picker">Set up a different method instead</label>
                  <select
                    id="mfa-method-picker"
                    value={setupMethod}
                    onChange={(event) => { setSetupMethod(event.target.value); setShowMethodPicker(false); setPhoneDigits(''); }}
                  >
                    {allowedMethods.map((m) => (
                      <option key={m} value={m}>{METHOD_LABELS[m].title}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
        </>
      )}

      {!flow && mfa.enrolled && (
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
                    <button className="account-button primary" type="button" aria-label={row.key === 'totp' ? 'Set up Authenticator app' : `Turn on ${row.title}`} onClick={() => startEnable(row.key)} disabled={busy === row.key}>
                      {row.key === 'totp' ? 'Set up' : 'Turn on'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="mfa-method">
              <div>
                <strong>Backup codes</strong>
                <p>
                  {mfa.backup_codes_remaining} unused code{mfa.backup_codes_remaining === 1 ? '' : 's'} remaining.
                </p>
              </div>
              {!regenerating && (
                <div className="mfa-method-actions">
                  <button className="account-button" type="button" onClick={() => setRegenerating(true)}>
                    Regenerate codes
                  </button>
                </div>
              )}
            </div>
          </div>

          {regenerating && (
            <div className="password-form">
              <label htmlFor="mfa-regen-password">Current password</label>
              <input
                id="mfa-regen-password"
                type="password"
                value={regeneratePassword}
                onChange={(event) => setRegeneratePassword(event.target.value)}
                autoComplete="current-password"
              />
              <small>Regenerating replaces every existing backup code with a new set.</small>
              <div className="account-card-footer">
                <button className="account-button" type="button" onClick={() => { setRegenerating(false); setRegeneratePassword(''); }} disabled={busy === 'regenerate'}>
                  Cancel
                </button>
                <button className="account-button primary" type="button" onClick={submitRegenerate} disabled={busy === 'regenerate'}>
                  {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate codes'}
                </button>
              </div>
            </div>
          )}

          {!allowedMethods.includes('sms') ? null : !mfa.methods.includes('sms') && (
            <div className="password-form">
              <label htmlFor="mfa-sms-phone">Phone number (for text message codes)</label>
              <div className="mfa-phone-input">
                <label className="sr-only" htmlFor="mfa-country-code">Country code</label>
                <select id="mfa-country-code" value={countryIso} onChange={(event) => { setCountryIso(event.target.value); setPhoneDigits(''); }}>
                  {COUNTRY_CODES.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.dialCode})</option>)}
                </select>
                <input
                  id="mfa-sms-phone"
                  value={formatNationalNumber(phoneDigits, selectedCountry.dialCode)}
                  onChange={(event) => setPhoneDigits(event.target.value.replace(/\D/g, '').slice(0, selectedCountry.nationalNumberLength + (selectedCountry.dialCode === '+1' ? 0 : 1)))}
                  placeholder={selectedCountry.code === 'US' ? '(864) 555-1234' : 'Phone number'}
                  inputMode="tel"
                  autoComplete="tel-national"
                />
              </div>
              <small>The country code is added automatically when the number is saved.</small>
            </div>
          )}
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
    </section>
  );
}
