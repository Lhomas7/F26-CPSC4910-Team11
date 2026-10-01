import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import * as api from '../config/api';
import './AdminUserDetailPage.css';

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join('') || '?';
}

function formFrom(account) {
  return {
    display_name: account.display_name,
    username: account.username,
    email: account.email,
    sponsor_org_id: account.sponsor_org ? String(account.sponsor_org.id) : '',
    is_active: account.is_active,
  };
}

export default function DriverDetailPage() {
  const { user, startImpersonation } = useAuth();
  const navigate = useNavigate();
  const { userId } = useParams();
  const [account, setAccount] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('loading');
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [viewingAs, setViewingAs] = useState(false);

  const viewAsDriver = async () => {
    setViewingAs(true);
    setErrors({});
    try {
      await startImpersonation(userId);
      navigate('/');
    } catch (error) {
      setErrors({ detail: error.message });
      setViewingAs(false);
    }
  };

  const load = useCallback(async () => {
    if (user?.account_type !== 'admin') return;
    setStatus('loading');
    try {
      const [details, companies] = await Promise.all([
        api.getAdminDriver(userId),
        api.getAdminSponsorOrganizations(),
      ]);
      setAccount(details);
      setForm(formFrom(details));
      setOrganizations(companies);
      setStatus('ready');
    } catch (error) {
      setStatus(error.status === 404 ? 'not-found' : error.status === 403 ? 'forbidden' : 'error');
    }
  }, [user, userId]);

  useEffect(() => {
    document.title = 'Driver account | Good Driver Incentive Program';
    if (user?.account_type === 'admin') load();
  }, [load, user]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const cancel = () => {
    setForm(formFrom(account));
    setErrors({});
    setEditing(false);
  };

  const save = async (event) => {
    event.preventDefault();
    const clientErrors = {};
    if (!form.display_name.trim()) clientErrors.display_name = 'Name is required.';
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(form.username)) clientErrors.username = 'Use 3 to 30 letters, numbers, periods, dashes, or underscores.';
    if (!form.email.trim()) clientErrors.email = 'Email is required.';
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }
    setStatus('saving');
    setErrors({});
    try {
      const saved = await api.updateAdminDriver(userId, {
        ...form,
        display_name: form.display_name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        sponsor_org_id: form.sponsor_org_id ? Number(form.sponsor_org_id) : null,
      });
      setAccount(saved);
      setForm(formFrom(saved));
      setEditing(false);
      setNotice('Driver account saved.');
      setStatus('ready');
    } catch (error) {
      setErrors(error.data || { detail: error.message });
      setStatus('ready');
    }
  };

  if (user?.account_type !== 'admin' || status === 'forbidden') return <main className="sponsor-detail-page"><section className="sponsor-detail-state"><h1>You don&apos;t have access to this page</h1><p>Only administrators can view and edit driver accounts.</p></section></main>;
  if (status === 'loading') return <main className="sponsor-detail-page"><p role="status">Loading driver account…</p><section className="sponsor-detail-card sponsor-detail-skeleton" aria-label="Loading the account" /></main>;
  if (status === 'error') return <main className="sponsor-detail-page"><section className="sponsor-detail-state error" role="alert"><h1>This account couldn&apos;t be loaded</h1><p>Check your connection and try again.</p><button type="button" onClick={load}>Try again</button></section></main>;
  if (status === 'not-found') return <main className="sponsor-detail-page"><section className="sponsor-detail-state"><h1>That driver account doesn&apos;t exist</h1><p>It may have been removed, or the link may be wrong.</p><Link to="/users">Back to users</Link></section></main>;

  return (
    <div className="sponsor-detail-page">
      <header className="sponsor-detail-heading"><p><Link to="/users">Users</Link> / {account.display_name}</p><h1>Driver account</h1></header>
      <main className="sponsor-detail-content">
        <section className="sponsor-detail-card">
          <div className="sponsor-detail-card-head">
            <div className="sponsor-detail-person">{account.profile_picture_url ? <span className="sponsor-detail-avatar"><img src={account.profile_picture_url} alt="" /></span> : <span className="sponsor-detail-avatar" aria-hidden="true">{initials(account.display_name)}</span>}<div><h2>{account.display_name}</h2><p>@{account.username} <span>Driver</span> · {account.is_active ? 'Active' : 'Inactive'}</p></div></div>
            {!editing && <div className="sponsor-detail-header-actions"><button type="button" onClick={viewAsDriver} disabled={viewingAs || !account.is_active}>{viewingAs ? 'Opening…' : 'View as driver'}</button><button type="button" onClick={() => { setNotice(''); setEditing(true); }}>Edit account</button></div>}
          </div>
          {errors.detail && !editing && <p className="sponsor-detail-error" role="alert">{errors.detail}</p>}
          {notice && <p className="sponsor-detail-notice" role="status">{notice}</p>}
          {!editing ? (
            <dl className="sponsor-detail-view">
              <div><dt>Full name</dt><dd>{account.display_name}</dd></div><div><dt>Username</dt><dd>@{account.username}</dd></div>
              <div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Sponsor organization</dt><dd>{account.sponsor_org?.name || <i>Not assigned</i>}</dd></div>
              <div><dt>Account status</dt><dd>{account.is_active ? 'Active' : 'Inactive'}</dd></div><div><dt>Account type</dt><dd>Driver <small>Locked after account creation</small></dd></div>
              <div><dt>Profile photo</dt><dd>{account.profile_picture_url ? 'Uploaded' : <i>None uploaded</i>} <small>Only the account holder can change this</small></dd></div>
            </dl>
          ) : (
            <form onSubmit={save} noValidate>
              {errors.detail && <p className="sponsor-detail-error" role="alert">{errors.detail}</p>}
              <div className="sponsor-detail-form">
                <label>Full name<input value={form.display_name} onChange={(e) => update('display_name', e.target.value)} />{errors.display_name && <small>{errors.display_name}</small>}</label>
                <label>Username<input value={form.username} onChange={(e) => update('username', e.target.value)} />{errors.username && <small>{errors.username}</small>}</label>
                <label>Email<input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />{errors.email && <small>{errors.email}</small>}</label>
                <label>Sponsor organization<select value={form.sponsor_org_id} onChange={(e) => update('sponsor_org_id', e.target.value)}><option value="">Not assigned</option>{organizations.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select><small>Optional. Leave unassigned until the driver joins a sponsor.</small></label>
                <label>Account status<select value={String(form.is_active)} onChange={(e) => update('is_active', e.target.value === 'true')}><option value="true">Active</option><option value="false">Inactive</option></select><small>An inactive account cannot sign in.</small></label>
                <div className="sponsor-detail-locked"><span>Account type</span><strong>Driver</strong><small>Cannot be changed after account creation.</small></div>
              </div>
              <div className="sponsor-detail-actions"><button type="button" onClick={cancel} disabled={status === 'saving'}>Cancel</button><button className="primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
