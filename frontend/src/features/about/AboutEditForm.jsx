import { useState } from 'react';

import { updateRelease } from '../../api';

const FIELDS = [
  { name: 'product_name', label: 'Product name', type: 'text', maxLength: 100 },
  { name: 'version_number', label: 'Version', type: 'text', maxLength: 30 },
  { name: 'release_date', label: 'Release date', type: 'date' },
  { name: 'team_number', label: 'Team number', type: 'number', min: 1 },
];

/** Admin-only editor for the current release shown on the About page. */
export default function AboutEditForm({ release, onSaved, onCancel }) {
  const [form, setForm] = useState({ ...release });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const update = (name) => (event) => setForm({ ...form, [name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const saved = await updateRelease({ ...form, team_number: Number(form.team_number) });
      onSaved(saved);
    } catch (requestError) {
      setErrors(requestError.data && typeof requestError.data === 'object'
        ? Object.fromEntries(Object.entries(requestError.data).map(([key, value]) => [key, [].concat(value)[0]]))
        : { detail: requestError.message });
      setBusy(false);
    }
  };

  const error = (name) => errors[name];

  return (
    <form className="about-card about-edit" onSubmit={submit} aria-labelledby="about-edit-heading">
      <h3 id="about-edit-heading">Edit release details</h3>
      {errors.detail && <p className="about-edit-error" role="alert">{errors.detail}</p>}
      <div className="about-edit-grid">
        {FIELDS.map((field) => (
          <label key={field.name}>
            <span>{field.label}</span>
            <input
              type={field.type}
              value={form[field.name] ?? ''}
              onChange={update(field.name)}
              maxLength={field.maxLength}
              min={field.min}
              required
              disabled={busy}
              aria-invalid={Boolean(error(field.name))}
            />
            {error(field.name) && <small className="about-edit-error">{error(field.name)}</small>}
          </label>
        ))}
      </div>
      <label>
        <span>Description</span>
        <textarea
          value={form.product_description ?? ''}
          onChange={update('product_description')}
          required
          disabled={busy}
          aria-invalid={Boolean(error('product_description'))}
        />
        {error('product_description') && <small className="about-edit-error">{error('product_description')}</small>}
      </label>
      <div className="about-edit-actions">
        <button className="about-button" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="about-button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}
