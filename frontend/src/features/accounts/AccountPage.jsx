import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import PageHeader from '../../app/PageHeader';
import Avatar from '../../components/Avatar';
import Skeleton from '../../components/Skeleton';
import StatePanel from '../../components/StatePanel';
import LoginActivityPanel from './LoginActivityPanel';
import MfaPanel from './MfaPanel';
import PasswordPanel from './PasswordPanel';
import './AccountPage.css';

const ACCOUNT_LABELS = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Admin' };
const PROFILE_PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROFILE_PICTURE_LIMIT = 2 * 1024 * 1024;
// Sign-in history is for privileged accounts that need to spot suspicious access.
const LOGIN_ACTIVITY_ROLES = ['sponsor', 'admin'];

function ProfileSkeleton() {
  return (
    <section className="account-card" aria-label="Loading your profile">
      <div className="account-card-header"><Skeleton className="account-skeleton account-skeleton-heading" /></div>
      <div className="profile-layout">
        <Skeleton className="account-skeleton account-skeleton-avatar" />
        <div className="account-skeleton-lines">
          <Skeleton className="account-skeleton" /><Skeleton className="account-skeleton short" />
          <Skeleton className="account-skeleton shorter" /><Skeleton className="account-skeleton short" />
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
  const [pendingPicture, setPendingPicture] = useState(null);
  const [removePicture, setRemovePicture] = useState(false);
  const [picturePreview, setPicturePreview] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

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

  const refreshMfa = useCallback(async () => {
    try {
      const data = await api.mfaStatus();
      const mfa = data.mfa;
      setProfile((prev) => {
        if (!prev) return prev;
        return { ...prev, mfa };
      });
      if (profile) {
        updateUser({ ...profile, mfa });
      }
    } catch {
      // Keep the current MFA view; a later action will refresh again.
    }
  }, [updateUser, profile]);

  useEffect(() => {
    document.title = 'My account | Good Driver Incentive Program';
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!pendingPicture) {
      setPicturePreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(pendingPicture);
    setPicturePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingPicture]);

  const beginEditing = () => {
    setForm({ name: profile.name, username: profile.username });
    setFormError('');
    setNotice('');
    setPendingPicture(null);
    setRemovePicture(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setForm({ name: profile.name, username: profile.username });
    setFormError('');
    setPendingPicture(null);
    setRemovePicture(false);
    setEditing(false);
  };

  const choosePicture = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!PROFILE_PICTURE_TYPES.includes(file.type)) {
      setFormError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > PROFILE_PICTURE_LIMIT) {
      setFormError('Profile pictures must be 2 MB or smaller.');
      return;
    }
    setFormError('');
    setPendingPicture(file);
    setRemovePicture(false);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const username = form.username.trim();
    if (!name || !username) {
      setFormError('Enter both a display name and username.');
      return;
    }
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
      setFormError('Username must be 3 to 30 characters using letters, numbers, periods, dashes, or underscores.');
      return;
    }

    setStatus('saving');
    setFormError('');
    setNotice('');
    try {
      const changes = { name, username };
      if (pendingPicture) changes.profile_picture = pendingPicture;
      if (removePicture) changes.remove_profile_picture = true;
      const updated = await api.updateProfile(changes);
      setProfile(updated);
      setForm({ name: updated.name, username: updated.username });
      updateUser(updated);
      setPendingPicture(null);
      setRemovePicture(false);
      setEditing(false);
      setNotice('Profile saved. Your changes are live.');
      setStatus('ready');
    } catch (error) {
      setFormError(error.data?.username?.[0] || error.data?.name?.[0]
        || error.message || 'Your changes could not be saved.');
      setStatus('ready');
    }
  };

  const roleLabel = profile && (ACCOUNT_LABELS[profile.account_type] || profile.account_type);
  const displayedPicture = removePicture ? '' : (picturePreview || profile?.avatar_url);
  const companyValue = profile?.account_type === 'admin'
    ? 'Not applicable'
    : (profile?.company || 'Not assigned yet');

  return (
    <div className="account-page">
      <PageHeader title="My account" subtitle="Your profile and sign-in details" />
      <main className="account-content" aria-busy={status === 'loading' || status === 'saving'}>
        <p className="sr-only" role="status" aria-live="polite">{status === 'loading' ? 'Loading your profile' : ''}</p>
        {status === 'loading' && <ProfileSkeleton />}
        {status === 'error' && (
          <StatePanel className="account-state" tone="error" title="Your profile couldn't be loaded">
            <p>The server didn&apos;t send back your account details. Check your connection and try again.</p>
            <button className="account-button primary" type="button" onClick={loadProfile}>Try again</button>
          </StatePanel>
        )}
        {profile && status !== 'loading' && status !== 'error' && (
          <>
            <section className="account-card" aria-labelledby="profile-heading">
              <div className="account-card-header">
                <div><h2 id="profile-heading">Profile</h2><p>{editing ? 'Editing. Changes are not saved until you select Save changes.' : 'Your account information'}</p></div>
                {!editing && <button className="account-button" type="button" onClick={beginEditing}>Edit profile</button>}
              </div>
              {notice && <p className="account-banner success" role="status">{notice}</p>}
              {formError && <p className="account-banner error" role="alert">{formError}</p>}
              {!editing ? (
                <div className="profile-layout">
                  <Avatar className="account-avatar" name={profile.name} src={profile.avatar_url} label={`Profile picture for ${profile.name}`} />
                  <dl className="profile-details">
                    <div><dt>Display name</dt><dd>{profile.name}</dd></div>
                    <div><dt>Username</dt><dd>@{profile.username}</dd></div>
                    <div><dt>Account type</dt><dd>{roleLabel}</dd></div>
                    <div><dt>Sponsor organization</dt><dd>{profile.account_type === 'admin' ? <i>{companyValue}</i> : (profile.company || <i>{companyValue}</i>)}</dd></div>
                  </dl>
                </div>
              ) : (
                <form onSubmit={saveProfile} noValidate>
                  <div className="profile-layout">
                    <div className="profile-picture-editor">
                      <Avatar className="account-avatar" name={form.name || profile.name} src={displayedPicture} label={`Profile picture for ${form.name || profile.name}`} />
                      {profile.account_type === 'driver' && (
                        <div className="profile-picture-actions">
                          <label className="account-button" htmlFor="profile-picture">Choose picture</label>
                          <input id="profile-picture" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePicture} disabled={status === 'saving'} />
                          {(displayedPicture || pendingPicture) && (
                            <button className="account-link-button" type="button" onClick={() => { setPendingPicture(null); setRemovePicture(Boolean(profile.avatar_url)); setFormError(''); }} disabled={status === 'saving'}>Remove picture</button>
                          )}
                          <small>JPG, PNG, or WebP. Maximum 2 MB.</small>
                        </div>
                      )}
                    </div>
                    <div className="profile-form">
                      <p className="profile-section-label">You can change</p>
                      <label htmlFor="profile-name">Display name</label>
                      <input id="profile-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength="200" autoComplete="name" disabled={status === 'saving'} />
                      <small>Required. Shown to your sponsor and admins.</small>
                      <label htmlFor="profile-username">Username</label>
                      <div className="username-input"><span aria-hidden="true">@</span><input id="profile-username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} maxLength="30" autoComplete="username" autoCapitalize="none" spellCheck="false" disabled={status === 'saving'} /></div>
                      <small>3 to 30 letters, numbers, periods, dashes, or underscores.</small>
                      <p className="profile-section-label">Only an admin can change</p>
                      <div className="locked-fields">
                        <div><span>Account type</span><strong>{roleLabel}</strong></div>
                        <div><span>Sponsor organization</span><strong>{companyValue}</strong></div>
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
            <PasswordPanel />
            <MfaPanel mfa={profile.mfa || { required: false, enrolled: false, methods: [] }} onRefreshed={refreshMfa} />
            {LOGIN_ACTIVITY_ROLES.includes(profile.account_type) && <LoginActivityPanel />}
          </>
        )}
      </main>
    </div>
  );
}
