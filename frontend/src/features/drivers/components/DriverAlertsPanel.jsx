import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import * as api from '../../../api';
import { useAuth } from '../../../auth/AuthContext';
import useApiRequest from '../../../hooks/useApiRequest';

const SUBSCRIPTION_FIELDS = [
  { field: 'on_points_added', label: (name) => `${name} gains points` },
  { field: 'on_points_removed', label: (name) => `${name} loses points` },
];

const SAVED_TEXT = {
  on_points_added: ['You will be alerted when they gain points.', 'Point-gain alerts are off.'],
  on_points_removed: ['You will be alerted when they lose points.', 'Point-loss alerts are off.'],
};

const DRIVER_SETTINGS = [
  { field: 'points_added_enabled', label: 'Points added' },
  { field: 'points_removed_enabled', label: 'Points removed' },
  { field: 'email_enabled', label: 'Email delivery' },
  { field: 'sms_enabled', label: 'Text message delivery' },
];

const ALWAYS_ON_LABELS = {
  sponsor_dropped: 'Dropped by or added to a sponsor',
  security: 'Account security',
};

/** The sponsor's own alerts about this driver, and the driver's alert settings. */
export default function DriverAlertsPanel({ driverId, driverName }) {
  const { user } = useAuth();
  const viewingAs = Boolean(user?.impersonation?.active);

  return (
    <>
      <SponsorAlertChoices driverId={driverId} driverName={driverName} viewingAs={viewingAs} />
      <DriverAlertSettings driverId={driverId} driverName={driverName} />
    </>
  );
}

function SponsorAlertChoices({ driverId, driverName, viewingAs }) {
  const [busy, setBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const { data, setData, error } = useApiRequest(
    useCallback(() => api.getDriverAlerts(driverId), [driverId]),
  );
  const message =
    saveMessage ||
    (error ? { ok: false, text: error.message || 'Your alerts could not be loaded.' } : null);

  const toggle = (field) => async (event) => {
    const next = event.target.checked;
    setBusy(true);
    setSaveMessage(null);
    setData((current) => ({ ...current, [field]: next }));
    try {
      setData(await api.updateDriverAlerts(driverId, { [field]: next }));
      setSaveMessage({ ok: true, text: SAVED_TEXT[field][next ? 0 : 1] });
    } catch (err) {
      setData((current) => ({ ...current, [field]: !next }));
      setSaveMessage({ ok: false, text: err.message || 'The alert could not be saved.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card driver-alerts" aria-labelledby="driver-alerts-heading">
      <header>
        <h2 id="driver-alerts-heading">Alert me when…</h2>
        <p>Alerts appear in your notification bell, including changes you make.</p>
      </header>
      <div className="driver-alerts-body">
        {SUBSCRIPTION_FIELDS.map(({ field, label }) => (
          <label className="driver-alert-toggle" key={field} htmlFor={`driver-alert-${field}`}>
            <input
              id={`driver-alert-${field}`}
              type="checkbox"
              checked={Boolean(data?.[field])}
              onChange={toggle(field)}
              disabled={busy || !data || viewingAs}
            />
            {label(driverName)}
          </label>
        ))}
        <p className="driver-alerts-hint">
          To also get these by email, turn on email in your <Link to="/account">account</Link>.
        </p>
        {message && (
          <p
            className={message.ok ? 'driver-alerts-message' : 'driver-alerts-message error'}
            role={message.ok ? 'status' : 'alert'}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

function DriverAlertSettings({ driverId, driverName }) {
  const { data, error } = useApiRequest(
    useCallback(() => api.getDriverAlertSettings(driverId), [driverId]),
  );

  return (
    <section className="card driver-alerts" aria-labelledby="driver-alert-settings-heading">
      <header>
        <h2 id="driver-alert-settings-heading">{driverName}&apos;s alert settings</h2>
        <p>These are the driver&apos;s own alerts. They don&apos;t change what you receive.</p>
      </header>
      <div className="driver-alerts-body">
        {error ? (
          <p className="driver-alerts-message error" role="alert">
            {error.message || 'Alert settings could not be loaded.'}
          </p>
        ) : !data ? (
          <p className="driver-alerts-hint" aria-busy="true">
            Loading alert settings…
          </p>
        ) : (
          <dl className="driver-alert-settings">
            {DRIVER_SETTINGS.map(({ field, label }) => (
              <div key={field}>
                <dt>Driver gets: {label}</dt>
                <dd>
                  <span className={`badge ${data[field] ? 'badge-success' : 'badge-neutral'}`}>
                    {data[field] ? 'On' : 'Off'}
                  </span>
                </dd>
              </div>
            ))}
            {(data.always_on || []).map((key) => (
              <div key={key}>
                <dt>Driver gets: {ALWAYS_ON_LABELS[key] || key}</dt>
                <dd>
                  <span className="badge badge-success">Always on</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
