import { useEffect, useState } from 'react';

import * as api from 'api';
import useApiRequest from 'hooks/useApiRequest';

const FIELDS = [
  ['support_email', 'Support email', 'email'],
  ['support_phone', 'Support phone', 'tel'],
];

/** The site-wide contact shown to every user in the help menu. */
export default function SupportContactPanel() {
  const { data, error } = useApiRequest(api.getRegistrationSettings);
  const [form, setForm] = useState({ support_email: '', support_phone: '' });
  const [busy, setBusy] = useState(false);
  const [saveMessage, setMessage] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const message =
    saveMessage ||
    (error
      ? { ok: false, text: error.message || 'The support contact could not be loaded.' }
      : null);

  useEffect(() => {
    if (data) {
      setForm({ support_email: data.support_email || '', support_phone: data.support_phone || '' });
    }
  }, [data]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFieldErrors({});
    try {
      const saved = await api.updateRegistrationSettings(form);
      setForm({ support_email: saved.support_email, support_phone: saved.support_phone });
      setMessage({ ok: true, text: 'The support contact was saved.' });
    } catch (err) {
      const errors = {};
      FIELDS.forEach(([name]) => {
        if (Array.isArray(err.data?.[name])) errors[name] = err.data[name].join(' ');
      });
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) {
        setMessage({ ok: false, text: err.message || 'The support contact could not be saved.' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card users-settings-card" aria-labelledby="support-contact-heading">
      <h2 id="support-contact-heading">Support contact</h2>
      <p className="users-settings-hint">
        Everyone sees this in the help menu when they need to reach an administrator.
      </p>
      <form className="users-support-form" onSubmit={submit} noValidate>
        {FIELDS.map(([name, label, type]) => (
          <div className="users-support-field" key={name}>
            <label htmlFor={`site-${name}`}>{label}</label>
            <input
              id={`site-${name}`}
              type={type}
              value={form[name]}
              onChange={(event) =>
                setForm((current) => ({ ...current, [name]: event.target.value }))
              }
              disabled={busy || !data}
              aria-invalid={Boolean(fieldErrors[name])}
              aria-describedby={fieldErrors[name] ? `site-${name}-error` : undefined}
            />
            {fieldErrors[name] && (
              <small id={`site-${name}-error`} className="users-settings-message error">
                {fieldErrors[name]}
              </small>
            )}
          </div>
        ))}
        <div>
          <button className="button button-primary" type="submit" disabled={busy || !data}>
            {busy ? 'Saving…' : 'Save contact'}
          </button>
        </div>
      </form>
      {message && (
        <p
          className={message.ok ? 'users-settings-message' : 'users-settings-message error'}
          role={message.ok ? 'status' : 'alert'}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
