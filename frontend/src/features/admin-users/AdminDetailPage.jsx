import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import PageHeader from '../../app/PageHeader';
import Avatar from '../../components/primitives/Avatar';
import StatePanel from '../../components/feedback/StatePanel';
import { validateEmail, validateName, validateUsername } from '../../utils/accountValidation';
import { fullName } from '../../utils/names';
import './AdminUserDetailPage.css';

function formFrom(account) {
  return {
    first_name: account.first_name,
    last_name: account.last_name,
    username: account.username,
    email: account.email,
    is_active: account.is_active,
  };
}

export default function AdminDetailPage() {
  const { user } = useAuth();
  const { userId } = useParams();
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('loading');
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (user?.account_type !== 'admin') return;
    setStatus('loading');
    try {
      const details = await api.getAdminAccount(userId);
      setAccount(details);
      setForm(formFrom(details));
      setStatus('ready');
    } catch (error) {
      setStatus(error.status === 404 ? 'not-found' : error.status === 403 ? 'forbidden' : 'error');
    }
  }, [user, userId]);

  useEffect(() => {
    document.title = 'Administrator account | Good Driver Incentive Program';
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
    const clientErrors = {
      first_name: validateName(form.first_name, 'first name'),
      last_name: validateName(form.last_name, 'last name'),
      username: validateUsername(form.username),
      email: validateEmail(form.email),
    };
    Object.keys(clientErrors).forEach((field) => {
      if (!clientErrors[field]) delete clientErrors[field];
    });
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      return;
    }

    setStatus('saving');
    setErrors({});
    try {
      const saved = await api.updateAdminAccount(userId, {
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
      });
      setAccount(saved);
      setForm(formFrom(saved));
      setEditing(false);
      setNotice('Administrator account saved.');
      setStatus('ready');
    } catch (error) {
      setErrors(error.data || { detail: error.message });
      setStatus('ready');
    }
  };

  if (user?.account_type !== 'admin' || status === 'forbidden') return <main className="sponsor-detail-page"><StatePanel className="sponsor-detail-state" headingLevel={1} title="You don't have access to this page"><p>Only administrators can review other administrator accounts.</p></StatePanel></main>;
  if (status === 'loading') return <main className="sponsor-detail-page"><p role="status">Loading administrator account…</p><section className="sponsor-detail-card sponsor-detail-skeleton" aria-label="Loading the account" /></main>;
  if (status === 'error') return <main className="sponsor-detail-page"><StatePanel className="sponsor-detail-state" headingLevel={1} tone="error" title="This account couldn't be loaded"><p>Check your connection and try again.</p><button type="button" onClick={load}>Try again</button></StatePanel></main>;
  if (status === 'not-found') return <main className="sponsor-detail-page"><StatePanel className="sponsor-detail-state" headingLevel={1} title="That administrator account isn't available"><p>It may not exist, or you may have selected your own account.</p><Link to="/users">Back to users</Link></StatePanel></main>;

  const name = fullName(account);
  return (
    <div className="sponsor-detail-page">
      <PageHeader title="Administrator account" breadcrumb={<><Link to="/users">Users</Link> / {name}</>} />
      <main className="sponsor-detail-content">
        <section className="sponsor-detail-card">
          <div className="sponsor-detail-card-head">
            <div className="sponsor-detail-person"><Avatar className="sponsor-detail-avatar" name={name} /><div><h2>{name}</h2><p>@{account.username} <span>Admin</span> · {account.is_active ? 'Active' : 'Inactive'}</p></div></div>
            {!editing && <button type="button" onClick={() => { setNotice(''); setEditing(true); }}>Edit account</button>}
          </div>
          {notice && <p className="sponsor-detail-notice" role="status">{notice}</p>}
          {!editing ? (
            <dl className="sponsor-detail-view">
              <div><dt>Full name</dt><dd>{name}</dd></div><div><dt>Username</dt><dd>@{account.username}</dd></div>
              <div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Account status</dt><dd>{account.is_active ? 'Active' : 'Inactive'}</dd></div>
              <div><dt>Account type</dt><dd>Administrator <small>Locked after account creation</small></dd></div>
            </dl>
          ) : (
            <form onSubmit={save} noValidate>
              {errors.detail && <p className="sponsor-detail-error" role="alert">{errors.detail}</p>}
              <div className="sponsor-detail-form">
                <label>First name<input value={form.first_name} onChange={(event) => update('first_name', event.target.value)} />{errors.first_name && <small>{errors.first_name}</small>}</label>
                <label>Last name<input value={form.last_name} onChange={(event) => update('last_name', event.target.value)} />{errors.last_name && <small>{errors.last_name}</small>}</label>
                <label>Username<input value={form.username} onChange={(event) => update('username', event.target.value)} />{errors.username && <small>{errors.username}</small>}</label>
                <label>Email<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />{errors.email && <small>{errors.email}</small>}</label>
                <label>Account status<select value={String(form.is_active)} onChange={(event) => update('is_active', event.target.value === 'true')}><option value="true">Active</option><option value="false">Inactive</option></select><small>An inactive account cannot sign in.</small></label>
                <div className="sponsor-detail-locked"><span>Account type</span><strong>Administrator</strong><small>Role and administrative privileges cannot be changed here.</small></div>
              </div>
              <div className="sponsor-detail-actions"><button type="button" onClick={cancel} disabled={status === 'saving'}>Cancel</button><button className="primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save changes'}</button></div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
