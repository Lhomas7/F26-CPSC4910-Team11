import { useState } from 'react';

import * as api from '../../../api';
import useApiRequest from '../../../hooks/useApiRequest';

const ALERT_OPTIONS = [
  { field: 'points_added_enabled', label: 'When points are added' },
  { field: 'points_removed_enabled', label: 'When points are removed' },
];

const CHANNEL_OPTIONS = [
  { field: 'email_enabled', label: 'Email alerts' },
  { field: 'sms_enabled', label: 'Text message alerts' },
];

const SAVED_TEXT = {
  points_added_enabled: ['Points-added alerts are on.', 'Points-added alerts are off.'],
  points_removed_enabled: ['Points-removed alerts are on.', 'Points-removed alerts are off.'],
  email_enabled: ['Alerts will be emailed to you.', 'Alerts will no longer be emailed.'],
  sms_enabled: ['Alerts will be texted to you.', 'Alerts will no longer be texted.'],
};

export default function NotificationsPanel({ phoneNumber }) {
  const [busy, setBusy] = useState(false);
  const [saveMessage, setMessage] = useState(null);
  const { data, setData, error } = useApiRequest(api.getNotificationPreferences);
  // The profile form above can add or clear the number without a reload.
  const hasPhone = Boolean(phoneNumber);
  const message =
    saveMessage ||
    (error
      ? { ok: false, text: error.message || 'Notification settings could not be loaded.' }
      : null);

  const setField = (field, value) => setData((current) => ({ ...current, [field]: value }));

  const toggle = (field) => async (event) => {
    const next = event.target.checked;
    setBusy(true);
    setMessage(null);
    setField(field, next);
    try {
      const saved = await api.updateNotificationPreferences({ [field]: next });
      setData(saved);
      setMessage({ ok: true, text: SAVED_TEXT[field][next ? 0 : 1] });
    } catch (err) {
      setField(field, !next);
      setMessage({ ok: false, text: err.message || 'The setting could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  const checkbox = ({ field, label }, disabled = false) => (
    <label className="notification-toggle" key={field} htmlFor={`notify-${field}`}>
      <input
        id={`notify-${field}`}
        type="checkbox"
        checked={Boolean(data?.[field]) && !disabled}
        onChange={toggle(field)}
        disabled={busy || !data || disabled}
      />
      {label}
    </label>
  );

  return (
    <section className="card account-card" aria-labelledby="notifications-heading">
      <div className="account-card-header">
        <div>
          <h2 id="notifications-heading">Notifications</h2>
          <p>Choose which point alerts you get and how they reach you.</p>
        </div>
      </div>
      <div className="notification-settings">
        <fieldset>
          <legend>Point alerts</legend>
          {ALERT_OPTIONS.map((option) => checkbox(option))}
        </fieldset>
        <fieldset>
          <legend>Send alerts by</legend>
          {checkbox(CHANNEL_OPTIONS[0])}
          {checkbox(CHANNEL_OPTIONS[1], !hasPhone)}
          {!hasPhone && (
            <p className="notification-hint">
              Add a phone number to your profile above to get alerts by text.
            </p>
          )}
        </fieldset>
        <p className="notification-hint">
          Alerts show the reason for the change and your new balance. Security alerts about your
          password, sign-ins, and multi-factor authentication are always sent.
        </p>
        {message && (
          <p
            className={message.ok ? 'notification-message' : 'notification-message error'}
            role={message.ok ? 'status' : 'alert'}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
