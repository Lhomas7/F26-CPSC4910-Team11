import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import PageHeader from '../../app/PageHeader';
import Avatar from '../../components/Avatar';
import StatePanel from '../../components/StatePanel';
import { fullName } from '../../utils/names';
import './AdminUserDetailPage.css';

function formFrom(account) {
  return {
    first_name: account.first_name,
    last_name: account.last_name,
    username: account.username,
    email: account.email,
    sponsor_org_id: String(account.sponsor_org.id),
    is_active: account.is_active,
  };
}

export default function SponsorDetailPage() {
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

  const viewAsSponsor = async () => {
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
        api.getAdminSponsor(userId),
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
    document.title = 'Sponsor account | Good Driver Incentive Program';
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
    if (!form.first_name.trim()) clientErrors.first_name = 'First name is required.';
    if (!form.last_name.trim()) clientErrors.last_name = 'Last name is required.';
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(form.username)) clientErrors.username = 'Use 3 to 30 letters, numbers, periods, dashes, or underscores.';
    if (!form.email.trim()) clientErrors.email = 'Email is required.';
    if (!form.sponsor_org_id) clientErrors.sponsor_org_id = 'Choose a sponsor organization.';
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }
    setStatus('saving');
    setErrors({});
    try {
      const saved = await api.updateAdminSponsor(userId, {
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        sponsor_org_id: Number(form.sponsor_org_id),
      });
      setAccount(saved);
      setForm(formFrom(saved));
      setEditing(false);
      setNotice('Sponsor account saved.');
      setStatus('ready');
    } catch (error) {
      setErrors(error.data || { detail: error.message });
      setStatus('ready');
    }
  };

  if (user?.account_type !== 'admin' || status === 'forbidden') return <main className="sponsor-detail-page"><StatePanel className="sponsor-detail-state" headingLevel={1} title="You don't have access to this page"><p>Only administrators can view and edit sponsor accounts.</p></StatePanel></main>;
  if (status === 'loading') return <main className="sponsor-detail-page"><p role="status">Loading sponsor account…</p><section className="sponsor-detail-card sponsor-detail-skeleton" aria-label="Loading the account" /></main>;
  if (status === 'error') return <main className="sponsor-detail-page"><StatePanel className="sponsor-detail-state" headingLevel={1} tone="error" title="This account couldn't be loaded"><p>Check your connection and try again.</p><button type="button" onClick={load}>Try again</button></StatePanel></main>;
  if (status === 'not-found') return <main className="sponsor-detail-page"><StatePanel className="sponsor-detail-state" headingLevel={1} title="That sponsor account doesn't exist"><p>It may have been removed, or the link may be wrong.</p><Link to="/users">Back to users</Link></StatePanel></main>;

  const name = fullName(account);
  return (
    <div className="sponsor-detail-page">
      <PageHeader title="Sponsor account" breadcrumb={<><Link to="/users">Users</Link> / {name}</>} />
      <main className="sponsor-detail-content">
        <section className="sponsor-detail-card">
          <div className="sponsor-detail-card-head">
            <div className="sponsor-detail-person"><Avatar className="sponsor-detail-avatar" name={name} /><div><h2>{name}</h2><p>@{account.username} <span>Sponsor</span> · {account.is_active ? 'Active' : 'Inactive'}</p></div></div>
            {!editing && <div className="sponsor-detail-header-actions"><button type="button" onClick={viewAsSponsor} disabled={viewingAs || !account.is_active}>{viewingAs ? 'Opening…' : 'View as sponsor'}</button><button type="button" onClick={() => { setNotice(''); setEditing(true); }}>Edit account</button></div>}
          </div>
          {errors.detail && !editing && <p className="sponsor-detail-error" role="alert">{errors.detail}</p>}
          {notice && <p className="sponsor-detail-notice" role="status">{notice}</p>}
          {!editing ? (
            <dl className="sponsor-detail-view">
              <div><dt>Full name</dt><dd>{name}</dd></div><div><dt>Username</dt><dd>@{account.username}</dd></div>
              <div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Sponsor organization</dt><dd>{account.sponsor_org.name}</dd></div>
              <div><dt>Account status</dt><dd>{account.is_active ? 'Active' : 'Inactive'}</dd></div><div><dt>Account type</dt><dd>Sponsor <small>Locked after account creation</small></dd></div>
            </dl>
          ) : (
            <form onSubmit={save} noValidate>
              {errors.detail && <p className="sponsor-detail-error" role="alert">{errors.detail}</p>}
              <div className="sponsor-detail-form">
                <label>First name<input value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />{errors.first_name && <small>{errors.first_name}</small>}</label>
                <label>Last name<input value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />{errors.last_name && <small>{errors.last_name}</small>}</label>
                <label>Username<input value={form.username} onChange={(e) => update('username', e.target.value)} />{errors.username && <small>{errors.username}</small>}</label>
                <label>Email<input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />{errors.email && <small>{errors.email}</small>}</label>
                <label>Sponsor organization<select value={form.sponsor_org_id} onChange={(e) => update('sponsor_org_id', e.target.value)}>{organizations.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select>{errors.sponsor_org_id && <small>{errors.sponsor_org_id}</small>}</label>
                <label>Account status<select value={String(form.is_active)} onChange={(e) => update('is_active', e.target.value === 'true')}><option value="true">Active</option><option value="false">Inactive</option></select><small>An inactive account cannot sign in.</small></label>
                <div className="sponsor-detail-locked"><span>Account type</span><strong>Sponsor</strong><small>Cannot be changed after account creation.</small></div>
              </div>
              <div className="sponsor-detail-actions"><button type="button" onClick={cancel} disabled={status === 'saving'}>Cancel</button><button className="primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
