import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../../auth/AuthContext';
import * as api from '../../../api';
import PageHeader from '../../../app/PageHeader';
import Avatar from '../../../components/primitives/Avatar';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import useApiRequest from '../../../hooks/useApiRequest';
import { validateEmail, validatePhoneNumber } from '../../../utils/accountValidation';
import LoginActivityPanel from '../components/LoginActivityPanel';
import MfaPanel from '../components/MfaPanel';
import PasswordPanel from '../components/PasswordPanel';
import '../Accounts.css';

const ACCOUNT_LABELS = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Admin' };
const PROFILE_PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROFILE_PICTURE_LIMIT = 2 * 1024 * 1024;
// Sign-in history is for privileged accounts that need to spot suspicious access.
const LOGIN_ACTIVITY_ROLES = ['sponsor', 'admin'];

function ProfileSkeleton() {
  return (
    <section className="card account-card" aria-label="Loading your profile">
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
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', phone_number: '' });
  const [pendingPicture, setPendingPicture] = useState(null);
  const [removePicture, setRemovePicture] = useState(false);
  const [picturePreview, setPicturePreview] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');

  const { data: profile, setData: setProfile, status: loadStatus, reload: loadProfile } = useApiRequest(
    useCallback(() => api.getProfile(), []),
    {
      onSuccess: (data) => setForm({
        name: data.name, username: data.username, email: data.email, phone_number: data.phone_number || '',
      }),
    },
  );
  // Any failed load (including 403/404) shows the retry panel.
  let status = 'error';
  if (saving) status = 'saving';
  else if (loadStatus === 'loading' || loadStatus === 'ready') status = loadStatus;

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
  }, [updateUser, profile, setProfile]);

  useEffect(() => {
    document.title = 'My account | Good Driver Incentive Program';
  }, []);

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
    setForm({ name: profile.name, username: profile.username, email: profile.email, phone_number: profile.phone_number || '' });
    setFormError('');
    setFieldErrors({});
    setNotice('');
    setPendingPicture(null);
    setRemovePicture(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setForm({ name: profile.name, username: profile.username, email: profile.email, phone_number: profile.phone_number || '' });
    setFormError('');
    setFieldErrors({});
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

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const username = form.username.trim();
    const validationErrors = {};
    if (!name) validationErrors.name = 'Enter a display name.';
    if (!username) validationErrors.username = 'Enter a username.';
    else if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
      validationErrors.username = 'Username must be 3 to 30 characters using letters, numbers, periods, dashes, or underscores.';
    }
    const emailError = validateEmail(form.email);
    if (emailError) validationErrors.email = emailError;
    const phoneError = profile.account_type === 'driver' && validatePhoneNumber(form.phone_number);
    if (phoneError) validationErrors.phone_number = phoneError;
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setFormError('');
      return;
    }

    setSaving(true);
    setFormError('');
    setFieldErrors({});
    setNotice('');
    try {
      const changes = { name, username, email: form.email.trim() };
      if (profile.account_type === 'driver') changes.phone_number = form.phone_number.trim();
      if (pendingPicture) changes.profile_picture = pendingPicture;
      if (removePicture) changes.remove_profile_picture = true;
      const updated = await api.updateProfile(changes);
      setProfile(updated);
      setForm({ name: updated.name, username: updated.username, email: updated.email, phone_number: updated.phone_number || '' });
      updateUser(updated);
      setPendingPicture(null);
      setRemovePicture(false);
      setEditing(false);
      setNotice('Profile saved. Your changes are live.');
    } catch (error) {
      const responseErrors = error.data || {};
      const nextFieldErrors = {};
      ['name', 'username', 'email', 'phone_number'].forEach((field) => {
        const detail = responseErrors[field];
        if (detail) nextFieldErrors[field] = Array.isArray(detail) ? detail[0] : detail;
      });
      setFieldErrors(nextFieldErrors);
      if (!Object.keys(nextFieldErrors).length) {
        setFormError(error.message || 'Your changes could not be saved.');
      }
    } finally {
      setSaving(false);
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
            <button className="button button-primary" type="button" onClick={loadProfile}>Try again</button>
          </StatePanel>
        )}
        {profile && status !== 'loading' && status !== 'error' && (
          <>
            <section className="card account-card" aria-labelledby="profile-heading">
              <div className="account-card-header">
                <div><h2 id="profile-heading">Profile</h2><p>{editing ? 'Editing. Changes are not saved until you select Save changes.' : 'Your account information'}</p></div>
                {!editing && <button className="button" type="button" onClick={beginEditing}>Edit profile</button>}
              </div>
              {notice && <p className="banner banner-success account-banner" role="status">{notice}</p>}
              {formError && <p className="banner banner-error account-banner" role="alert">{formError}</p>}
              {!editing ? (
                <div className="profile-layout">
                  <Avatar className="account-avatar" name={profile.name} src={profile.avatar_url} label={`Profile picture for ${profile.name}`} />
                  <dl className="profile-details">
                    <div><dt>Display name</dt><dd>{profile.name}</dd></div>
                    <div><dt>Username</dt><dd>@{profile.username}</dd></div>
                    <div><dt>Email</dt><dd>{profile.email}</dd></div>
                    {profile.account_type === 'driver' && <div><dt>Phone</dt><dd>{profile.phone_number || <i>Not provided</i>}</dd></div>}
                    <div><dt>Account type</dt><dd>{roleLabel}</dd></div>
                    <div><dt>Sponsor organization</dt><dd>{profile.account_type === 'admin' ? <i>{companyValue}</i> : (profile.company || <i>{companyValue}</i>)}</dd></div>
                  </dl>
                </div>
              ) : (
                <form onSubmit={saveProfile} noValidate>
                  <div className="profile-layout">
                    <div className="profile-picture-editor">
                      <Avatar className="account-avatar" name={form.name || profile.name} src={displayedPicture} label={`Profile picture for ${form.name || profile.name}`} />
                      <div className="profile-picture-actions">
                          <label className="button" htmlFor="profile-picture">Choose picture</label>
                          <input id="profile-picture" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePicture} disabled={status === 'saving'} />
                          {(displayedPicture || pendingPicture) && (
                            <button className="button button-link" type="button" onClick={() => { setPendingPicture(null); setRemovePicture(Boolean(profile.avatar_url)); setFormError(''); }} disabled={status === 'saving'}>Remove picture</button>
                          )}
                          <small>JPG, PNG, or WebP. Maximum 2 MB.</small>
                      </div>
                    </div>
                    <div className="profile-form">
                      <p className="profile-section-label">You can change</p>
                      <label htmlFor="profile-name">Display name</label>
                      <input id="profile-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} maxLength="200" autoComplete="name" disabled={status === 'saving'} aria-invalid={Boolean(fieldErrors.name)} aria-describedby="profile-name-help" />
                      <small id="profile-name-help" className={fieldErrors.name ? 'profile-field-error' : ''} role={fieldErrors.name ? 'alert' : undefined}>{fieldErrors.name || 'Required. Shown to your sponsor and admins.'}</small>
                      <label htmlFor="profile-username">Username</label>
                      <div className="username-input"><span aria-hidden="true">@</span><input id="profile-username" value={form.username} onChange={(event) => updateField('username', event.target.value)} maxLength="30" autoComplete="username" autoCapitalize="none" spellCheck="false" disabled={status === 'saving'} aria-invalid={Boolean(fieldErrors.username)} aria-describedby="profile-username-help" /></div>
                      <small id="profile-username-help" className={fieldErrors.username ? 'profile-field-error' : ''} role={fieldErrors.username ? 'alert' : undefined}>{fieldErrors.username || '3 to 30 letters, numbers, periods, dashes, or underscores.'}</small>
                      <label htmlFor="profile-email">Email</label>
                      <input id="profile-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} maxLength="254" autoComplete="email" autoCapitalize="none" spellCheck="false" disabled={status === 'saving'} aria-invalid={Boolean(fieldErrors.email)} aria-describedby="profile-email-help" />
                      <small id="profile-email-help" className={fieldErrors.email ? 'profile-field-error' : ''} role={fieldErrors.email ? 'alert' : undefined}>{fieldErrors.email || 'Used for account notices and password recovery.'}</small>
                      {profile.account_type === 'driver' && (
                        <>
                          <label htmlFor="profile-phone">Phone</label>
                          <input id="profile-phone" type="tel" value={form.phone_number} onChange={(event) => updateField('phone_number', event.target.value)} maxLength="30" autoComplete="tel" disabled={status === 'saving'} aria-invalid={Boolean(fieldErrors.phone_number)} aria-describedby="profile-phone-help" />
                          <small id="profile-phone-help" className={fieldErrors.phone_number ? 'profile-field-error' : ''} role={fieldErrors.phone_number ? 'alert' : undefined}>{fieldErrors.phone_number || 'Optional. US numbers may use familiar formatting; other numbers need a country code.'}</small>
                        </>
                      )}
                      <p className="profile-section-label">Only an admin can change</p>
                      <div className="locked-fields">
                        <div><span>Account type</span><strong>{roleLabel}</strong></div>
                        <div><span>Sponsor organization</span><strong>{companyValue}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="account-card-footer">
                    <button className="button" type="button" onClick={cancelEditing} disabled={status === 'saving'}>Cancel</button>
                    <button className="button button-primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save changes'}</button>
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
