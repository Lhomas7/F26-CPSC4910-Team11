import { useEffect, useState } from 'react';

import * as api from '../../api';

export default function RegistrationSettingsPanel() {
  const [required, setRequired] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    api.getRegistrationSettings()
      .then((data) => {
        if (active) setRequired(data.email_verification_required);
      })
      .catch((err) => {
        if (active) setMessage({ ok: false, text: err.message || 'Account creation settings could not be loaded.' });
      });
    return () => { active = false; };
  }, []);

  const toggle = async (event) => {
    const next = event.target.checked;
    setBusy(true);
    setMessage(null);
    setRequired(next);
    try {
      const saved = await api.updateRegistrationSettings({ email_verification_required: next });
      setRequired(saved.email_verification_required);
      setMessage({
        ok: true,
        text: next
          ? 'New drivers and sponsors must now verify their email to create an account.'
          : 'New accounts no longer require email verification.',
      });
    } catch (err) {
      setRequired(!next);
      setMessage({ ok: false, text: err.message || 'The setting could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card users-settings-card" aria-labelledby="registration-settings-heading">
      <h2 id="registration-settings-heading">Account creation</h2>
      <label className="users-settings-toggle" htmlFor="require-email-verification">
        <input
          id="require-email-verification"
          type="checkbox"
          checked={required === true}
          onChange={toggle}
          disabled={busy || required === null}
        />
        Require email verification for new driver and sponsor accounts
      </label>
      <p className="users-settings-hint">
        When this is on, people creating an account get a short code at the email address
        they entered, and the account is created only after they enter it.
      </p>
      {message && (
        <p className={message.ok ? 'users-settings-message' : 'users-settings-message error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
