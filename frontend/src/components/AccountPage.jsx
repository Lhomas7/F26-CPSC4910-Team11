import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import * as api from '../config/api';
import './AccountPage.css';

const ACCOUNT_LABELS = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Admin' };

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join('') || '?';
}

function ProfileSkeleton() {
  return (
    <section className="account-card" aria-label="Loading your profile">
      <div className="account-card-header"><span className="account-skeleton account-skeleton-heading" /></div>
      <div className="profile-layout">
        <span className="account-skeleton account-skeleton-avatar" />
        <div className="account-skeleton-lines">
          <span className="account-skeleton" /><span className="account-skeleton short" />
          <span className="account-skeleton shorter" /><span className="account-skeleton short" />
        </div>
      </div>
    </section>
  );
}

export default function AccountPage() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', username: '' });
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.getProfile();
      setProfile(data);
      setForm({ name: data.name, username: data.username });
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    document.title = 'My account | Good Driver Incentive Program';
    loadProfile();
  }, [loadProfile]);

  const beginEditing = () => {
    setForm({ name: profile.name, username: profile.username });
    setFormError('');
    setNotice('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setForm({ name: profile.name, username: profile.username });
    setFormError('');
    setEditing(false);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const username = form.username.trim();
    if (!name || !username) {
      setFormError('Enter both a display name and username.');
      return;
    }

    setStatus('saving');
    setFormError('');
    setNotice('');
    try {
      const updated = await api.updateProfile({ name, username });
      setProfile(updated);
      setForm({ name: updated.name, username: updated.username });
      updateUser(updated);
      setEditing(false);
      setNotice('Profile saved. Your changes are live.');
      setStatus('ready');
    } catch (error) {
      setFormError(error.data?.username?.[0] || error.data?.name?.[0]
        || error.message || 'Your changes could not be saved.');
      setStatus('ready');
    }
  };

  const validatePassword = () => {
    if (!password) return 'Enter a new password.';
    if (password.length < 12) return 'Password must be at least 12 characters long.';
    if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one symbol.';
    if (password !== passwordConfirm) return 'Passwords do not match.';
    return null;
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    const problem = validatePassword();
    if (problem) {
      setPasswordError(problem);
      return;
    }
    setPasswordBusy(true);
    try {
      await api.changePassword(password);
      setPassword('');
      setPasswordConfirm('');
      setPasswordSuccess('Password changed successfully.');
    } catch (error) {
      setPasswordError(error.message || 'Password could not be changed.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const roleLabel = profile && (ACCOUNT_LABELS[profile.account_type] || profile.account_type);

  return (
    <div className="account-page">
      <header className="account-heading"><h1>My account</h1><p>Your profile and sign-in details</p></header>
      <main className="account-content" aria-busy={status === 'loading' || status === 'saving'}>
        <p className="sr-only" role="status" aria-live="polite">{status === 'loading' ? 'Loading your profile' : ''}</p>
        {status === 'loading' && <ProfileSkeleton />}
        {status === 'error' && (
          <section className="account-state account-state-error" role="alert">
            <h2>Your profile couldn&apos;t be loaded</h2>
            <p>The server didn&apos;t send back your account details. Check your connection and try again.</p>
            <button className="account-button primary" type="button" onClick={loadProfile}>Try again</button>
          </section>
        )}
        {profile && status !== 'loading' && status !== 'error' && (
          <>
            <section className="account-card" aria-labelledby="profile-heading">
              <div className="account-card-header">
                <div><h2 id="profile-heading">Profile</h2><p>{editing ? 'Editing. Changes are not saved until you select Save changes.' : 'How you appear to your sponsor and admins'}</p></div>
                {!editing && <button className="account-button" type="button" onClick={beginEditing}>Edit profile</button>}
              </div>
              {notice && <p className="account-banner success" role="status">{notice}</p>}
              {formError && <p className="account-banner error" role="alert">{formError}</p>}
              {!editing ? (
                <div className="profile-layout">
                  <div className="account-avatar" aria-label={`Initials for ${profile.name}`}>{initials(profile.name)}</div>
                  <dl className="profile-details">
                    <div><dt>Display name</dt><dd>{profile.name}</dd></div>
                    <div><dt>Username</dt><dd>@{profile.username}</dd></div>
                    <div><dt>Account type</dt><dd>{roleLabel}</dd></div>
                    <div><dt>Sponsor organization</dt><dd>{profile.company || <i>Not assigned yet</i>}</dd></div>
                  </dl>
                </div>
              ) : (
                <form onSubmit={saveProfile} noValidate>
                  <div className="profile-layout">
                    <div className="account-avatar" aria-label={`Initials for ${form.name || profile.name}`}>{initials(form.name || profile.name)}</div>
                    <div className="profile-form">
                      <p className="profile-section-label">You can change</p>
                      <label htmlFor="profile-name">Display name</label>
                      <input id="profile-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength="200" autoComplete="name" disabled={status === 'saving'} />
                      <small>Required. Shown to your sponsor and admins.</small>
                      <label htmlFor="profile-username">Username</label>
                      <div className="username-input"><span aria-hidden="true">@</span><input id="profile-username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} maxLength="150" autoComplete="username" autoCapitalize="none" spellCheck="false" disabled={status === 'saving'} /></div>
                      <small>You&apos;ll use this username to sign in.</small>
                      <p className="profile-section-label">Only an admin can change</p>
                      <div className="locked-fields">
                        <div><span>Account type</span><strong>{roleLabel}</strong></div>
                        <div><span>Sponsor organization</span><strong>{profile.company || 'Not assigned yet'}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="account-card-footer">
                    <button className="account-button" type="button" onClick={cancelEditing} disabled={status === 'saving'}>Cancel</button>
                    <button className="account-button primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save changes'}</button>
                  </div>
                </form>
              )}
            </section>
            <section className="account-card" aria-labelledby="password-heading">
              <div className="account-card-header"><div><h2 id="password-heading">Password</h2><p>Change the password you use to sign in</p></div></div>
              <form className="password-form" onSubmit={changePassword}>
                <label htmlFor="new-password">New password</label>
                <input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" disabled={passwordBusy} />
                <label htmlFor="confirm-password">Confirm new password</label>
                <input id="confirm-password" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" disabled={passwordBusy} />
                {passwordError && <p className="account-banner error" role="alert">{passwordError}</p>}
                {passwordSuccess && <p className="account-banner success" role="status">{passwordSuccess}</p>}
                <div className="account-card-footer"><button className="account-button primary" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Changing password…' : 'Change password'}</button></div>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
