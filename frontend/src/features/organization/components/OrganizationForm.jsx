import { useState } from 'react';

import { updateOrganization } from 'api';

const FIELDS = [
  ['name', 'Organization name', 'text', 'The name drivers see across the program.'],
  ['website', 'Website', 'url', 'Starts with https://'],
  ['contact_email', 'Contact email', 'email', 'Where drivers can reach your program.'],
  ['contact_phone', 'Contact phone', 'tel', 'Include the country code outside the US.'],
];
const SUPPORT_FIELDS = [
  ['support_contact_name', 'Contact name', 'text', 'Who drivers should ask for.'],
  ['support_email', 'Support email', 'email', 'Leave blank to use your contact email.'],
  ['support_phone', 'Support phone', 'tel', 'Leave blank to use your contact phone.'],
  ['support_hours', 'Hours', 'text', 'For example, Mon-Fri, 8am-5pm ET.'],
];

function toForm(organization) {
  return {
    name: organization.name || '',
    description: organization.description || '',
    website: organization.website || '',
    contact_email: organization.contact_email || '',
    contact_phone: organization.contact_phone || '',
    support_contact_name: organization.support_contact_name || '',
    support_email: organization.support_email || '',
    support_phone: organization.support_phone || '',
    support_hours: organization.support_hours || '',
  };
}

/** A sponsor's editable organization details. */
export default function OrganizationForm({ organization, onSaved }) {
  const [form, setForm] = useState(() => toForm(organization));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const update = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setNotice('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setFieldErrors({});
    try {
      const saved = await updateOrganization(form);
      setForm(toForm(saved));
      setNotice('Your organization details were saved. Drivers can see them now.');
      onSaved?.(saved);
    } catch (requestError) {
      const data = requestError.data || {};
      const errors = {};
      Object.keys(form).forEach((name) => {
        if (Array.isArray(data[name])) errors[name] = data[name].join(' ');
      });
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const renderField = ([name, label, type, hint]) => (
    <div className="organization-field" key={name}>
      <label htmlFor={`org-${name}`}>{label}</label>
      <input
        id={`org-${name}`}
        type={type}
        value={form[name]}
        onChange={(event) => update(name, event.target.value)}
        disabled={busy}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={`org-${name}-hint`}
      />
      <small id={`org-${name}-hint`} className={fieldErrors[name] ? 'organization-error' : ''}>
        {fieldErrors[name] || hint}
      </small>
    </div>
  );

  return (
    <form className="card organization-card" onSubmit={submit} noValidate>
      <header>
        <h2>Organization details</h2>
        <p>Drivers see this so they know more about their sponsor.</p>
      </header>
      {FIELDS.map(renderField)}
      <div className="organization-field">
        <label htmlFor="org-description">About your program</label>
        <textarea
          id="org-description"
          rows={5}
          maxLength={1000}
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          disabled={busy}
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby="org-description-hint"
        />
        <small
          id="org-description-hint"
          className={fieldErrors.description ? 'organization-error' : ''}
        >
          {fieldErrors.description || `${form.description.length}/1000 characters`}
        </small>
      </div>
      <fieldset className="organization-support">
        <legend>Driver support contact</legend>
        <p>Shown in the help menu when your drivers need to reach you.</p>
        {SUPPORT_FIELDS.map(renderField)}
      </fieldset>
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="banner banner-success" role="status">
          {notice}
        </p>
      )}
      <div>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  );
}
