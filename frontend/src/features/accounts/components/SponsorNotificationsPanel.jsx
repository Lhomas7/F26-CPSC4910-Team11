import { useState } from 'react';

import * as api from '../../../api';
import useApiRequest from '../../../hooks/useApiRequest';

/** Whether a sponsor's driver point alerts are also emailed. */
export default function SponsorNotificationsPanel() {
  const [busy, setBusy] = useState(false);
  const [saveMessage, setMessage] = useState(null);
  const { data, setData, error } = useApiRequest(api.getSponsorNotificationPreferences);
  const message =
    saveMessage ||
    (error
      ? { ok: false, text: error.message || 'Notification settings could not be loaded.' }
      : null);

  const toggleEmail = async (event) => {
    const next = event.target.checked;
    setBusy(true);
    setMessage(null);
    setData({ email_enabled: next });
    try {
      setData(await api.updateSponsorNotificationPreferences({ email_enabled: next }));
      setMessage({
        ok: true,
        text: next
          ? 'Driver alerts will be emailed to you.'
          : 'Driver alerts will no longer be emailed.',
      });
    } catch (err) {
      setData({ email_enabled: !next });
      setMessage({ ok: false, text: err.message || 'The setting could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card account-card" aria-labelledby="notifications-heading">
      <div className="account-card-header">
        <div>
          <h2 id="notifications-heading">Notifications</h2>
          <p>Choose which drivers you get point alerts about from each driver&apos;s page.</p>
        </div>
      </div>
      <div className="notification-settings">
        <fieldset>
          <legend>Send driver alerts by</legend>
          <label className="notification-toggle" htmlFor="notify-sponsor-email">
            <input
              id="notify-sponsor-email"
              type="checkbox"
              checked={Boolean(data?.email_enabled)}
              onChange={toggleEmail}
              disabled={busy || !data}
            />
            Also email me
          </label>
        </fieldset>
        <p className="notification-hint">
          Driver alerts always appear in your notification bell. Security alerts are always sent.
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
