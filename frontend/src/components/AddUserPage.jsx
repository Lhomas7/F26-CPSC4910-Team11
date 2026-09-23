import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import * as api from '../config/api';
import './AddUserPage.css';

const EMPTY_FORM = {
  role: 'driver', first_name: '', last_name: '', username: '', email: '',
  sponsor_org_id: '', password: '', confirm_password: '',
};
const ROLE_LABELS = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Admin' };

export default function AddUserPage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [status, setStatus] = useState('loading');
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [created, setCreated] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const loadOrganizations = useCallback(async () => {
    if (user?.account_type !== 'admin') return;
    setStatus('loading');
    try {
      setOrganizations(await api.getAdminSponsorOrganizations());
      setStatus('ready');
    } catch (error) {
      setStatus(error.status === 403 ? 'forbidden' : 'error');
    }
  }, [user]);

  useEffect(() => {
    document.title = 'Add user | Good Driver Incentive Program';
    if (user?.account_type === 'admin') loadOrganizations();
  }, [loadOrganizations, user]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const chooseRole = (role) => {
    setForm((current) => ({ ...current, role, sponsor_org_id: '' }));
    setErrors({});
  };

  const validate = () => {
    const next = {};
    if (!form.first_name.trim()) next.first_name = 'Enter a first name.';
    if (!form.last_name.trim()) next.last_name = 'Enter a last name.';
    if (!form.username.trim()) next.username = 'Enter a username.';
    else if (form.username.trim().length < 3) next.username = 'Username must be at least 3 characters.';
    else if (!/^[A-Za-z0-9._-]+$/.test(form.username.trim())) next.username = 'Use only letters, numbers, periods, dashes, or underscores.';
    if (!form.email.trim()) next.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.role === 'sponsor' && !form.sponsor_org_id) next.sponsor_org_id = 'Choose the organization this sponsor manages.';
    if (form.password.length < 12) next.password = 'Password must be at least 12 characters.';
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password)) next.password = 'Password must include a letter, number, and symbol.';
    if (!form.confirm_password) next.confirm_password = 'Re-enter the password.';
    else if (form.confirm_password !== form.password) next.confirm_password = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setStatus('saving');
    setErrors({});
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      role: form.role,
      sponsor_org_id: form.role === 'admin' || !form.sponsor_org_id
        ? null : Number(form.sponsor_org_id),
      password: form.password,
    };
    try {
      setCreated(await api.createAdminUser(payload));
      setStatus('created');
    } catch (error) {
      if (error.status === 403) {
        setStatus('forbidden');
      } else {
        const data = error.data || {};
        setErrors({
          ...data,
          form: Object.keys(data).length ? 'Fix the highlighted fields and try again.' : 'The account could not be created. Try again.',
        });
        setStatus('ready');
      }
    }
  };

  const addAnother = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setCreated(null);
    setShowPassword(false);
    setStatus('ready');
  };

  const fieldError = (name) => Array.isArray(errors[name]) ? errors[name][0] : errors[name];
  const selectedOrganization = organizations.find((org) => String(org.id) === String(form.sponsor_org_id));

  if (user?.account_type !== 'admin' || status === 'forbidden') {
    return <main className="add-user-page"><section className="add-user-state"><h1>You don&apos;t have access to this page</h1><p>Only administrators can create user accounts.</p><Link className="add-user-button" to="/account">Go to my account</Link></section></main>;
  }

  return (
    <div className="add-user-page">
      <header className="add-user-heading"><p><Link to="/users">Users</Link> / Add user</p><h1>Add user</h1></header>
      <main className="add-user-content" aria-busy={status === 'loading' || status === 'saving'}>
        <p className="sr-only" role="status" aria-live="polite">{status === 'loading' ? 'Loading the form' : status === 'saving' ? 'Creating account' : ''}</p>
        {status === 'loading' && <section className="add-user-state" aria-label="Loading the form"><span className="add-user-skeleton wide" /><span className="add-user-skeleton block" /><span className="add-user-skeleton" /></section>}
        {status === 'error' && <section className="add-user-state error" role="alert"><h2>The form couldn&apos;t be loaded</h2><p>The sponsor organization list didn&apos;t come back from the server.</p><button className="add-user-button primary" type="button" onClick={loadOrganizations}>Try again</button></section>}
        {status === 'created' && created && (
          <section className="add-user-state success">
            <span className="add-user-check" aria-hidden="true">✓</span>
            <h2>{ROLE_LABELS[created.role]} account created</h2>
            <p>{created.display_name} can sign in as @{created.username} with the temporary password.</p>
            <dl className="add-user-summary"><div><dt>Name</dt><dd>{created.display_name}</dd></div><div><dt>Username</dt><dd>@{created.username}</dd></div><div><dt>Account type</dt><dd>{ROLE_LABELS[created.role]}</dd></div><div><dt>Sponsor organization</dt><dd>{created.sponsor_org?.name || (created.role === 'driver' ? 'Not assigned' : 'Not applicable')}</dd></div></dl>
            <div className="add-user-actions"><button className="add-user-button primary" type="button" onClick={addAnother}>Add another user</button><Link className="add-user-button" to="/users">Back to users</Link></div>
          </section>
        )}
        {(status === 'ready' || status === 'saving') && (
          <form className="add-user-card" onSubmit={submit} noValidate>
            {errors.form && <p className="add-user-banner" role="alert">{errors.form}</p>}
            <div className="add-user-body">
              <fieldset><legend>Account type</legend><div className="add-user-roles">
                {[['driver', 'Earns and spends points'], ['sponsor', 'Manages drivers and a catalog'], ['admin', 'Manages every account']].map(([role, description]) => <label key={role}><input type="radio" name="role" value={role} checked={form.role === role} onChange={() => chooseRole(role)} disabled={status === 'saving'} /><span><strong>{ROLE_LABELS[role]}</strong><small>{description}</small></span></label>)}
              </div></fieldset>
              <div className="add-user-two"><Field label="First name" name="first_name" value={form.first_name} error={fieldError('first_name')} onChange={update} disabled={status === 'saving'} /><Field label="Last name" name="last_name" value={form.last_name} error={fieldError('last_name')} onChange={update} disabled={status === 'saving'} /></div>
              <div className="add-user-two"><Field label="Username" name="username" value={form.username} error={fieldError('username')} onChange={update} disabled={status === 'saving'} hint="3–30 letters, numbers, periods, dashes, or underscores." /><Field label="Email" name="email" type="email" value={form.email} error={fieldError('email')} onChange={update} disabled={status === 'saving'} /></div>
              {form.role !== 'admin' && <div className="add-user-field"><label htmlFor="sponsor-org">Sponsor organization {form.role === 'driver' && <span>(optional)</span>}</label><select id="sponsor-org" value={form.sponsor_org_id} onChange={(event) => update('sponsor_org_id', event.target.value)} disabled={status === 'saving' || organizations.length === 0} aria-invalid={Boolean(fieldError('sponsor_org_id'))}><option value="">{form.role === 'driver' ? 'Leave unassigned for now' : organizations.length ? 'Choose an organization' : 'No organizations available'}</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select><small className={fieldError('sponsor_org_id') ? 'error' : ''}>{fieldError('sponsor_org_id') || (form.role === 'driver' ? 'A driver can be linked to a sponsor later.' : 'Required for sponsor accounts.')}</small></div>}
              {form.role === 'admin' && <p className="add-user-note">Administrators aren&apos;t tied to a sponsor organization.</p>}
              <div className="add-user-divider" />
              <div className="add-user-two"><div className="add-user-field"><label htmlFor="password">Temporary password</label><div className="add-user-password"><input id="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => update('password', event.target.value)} disabled={status === 'saving'} aria-invalid={Boolean(fieldError('password'))} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div><small className={fieldError('password') ? 'error' : ''}>{fieldError('password') || 'At least 12 characters with a letter, number, and symbol.'}</small></div><Field label="Confirm password" name="confirm_password" type={showPassword ? 'text' : 'password'} value={form.confirm_password} error={fieldError('confirm_password')} onChange={update} disabled={status === 'saving'} /></div>
              {selectedOrganization && <p className="add-user-note">Selected organization: {selectedOrganization.name}</p>}
            </div>
            <footer className="add-user-footer"><Link className="add-user-button" to="/users">Cancel</Link><button className="add-user-button primary" type="submit" disabled={status === 'saving' || (form.role === 'sponsor' && organizations.length === 0)}>{status === 'saving' ? 'Creating…' : `Create ${form.role} account`}</button></footer>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({ label, name, type = 'text', value, error, hint, onChange, disabled }) {
  return <div className="add-user-field"><label htmlFor={name}>{label}</label><input id={name} type={type} value={value} onChange={(event) => onChange(name, event.target.value)} disabled={disabled} aria-invalid={Boolean(error)} autoComplete="off" /><small className={error ? 'error' : ''}>{error || hint}</small></div>;
}
