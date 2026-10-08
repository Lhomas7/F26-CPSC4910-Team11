import { useState } from 'react';

import { getSponsorMfaSetting, sponsorMfaSettings } from '../../../api';
import useApiRequest from '../../../hooks/useApiRequest';

export default function DriverMfaRequirement({ company }) {
  const [busy, setBusy] = useState(false);
  const [toggleMessage, setMessage] = useState(null);
  const { data, setData, error: loadError } = useApiRequest(getSponsorMfaSetting);
  const required = data ? data.driver_mfa_required : null;
  const setRequired = (value) => setData((current) => ({ ...current, driver_mfa_required: value }));
  const message = toggleMessage || (loadError ? { ok: false, text: loadError.message } : null);

  const toggle = async (event) => {
    const next = event.target.checked;
    setBusy(true);
    setMessage(null);
    try {
      await sponsorMfaSettings(next);
      setRequired(next);
      setMessage({
        ok: true,
        text: next
          ? 'MFA is now required for every driver at your company.'
          : 'MFA is no longer required for drivers at your company.',
      });
    } catch (error) {
      setMessage({ ok: false, text: error.message });
      setRequired(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="driver-organization-settings" aria-labelledby="driver-settings-heading">
      <header>
        <h2 id="driver-settings-heading">Organization driver settings</h2>
        <p>Applies to every driver at {company || 'your organization'}.</p>
      </header>
      <div className="driver-setting-row">
        <div>
          <strong>Require driver two-factor authentication</strong>
          <p>Drivers at your organization must set up two-factor authentication before they can keep signing in. Changing this notifies affected drivers.</p>
        </div>
        <label className="driver-setting-switch" htmlFor="require-mfa">
          <input id="require-mfa" type="checkbox" checked={required === true} onChange={toggle} disabled={busy || required === null} />
          <span>{required ? 'Required' : 'Not required'}</span>
        </label>
      </div>
      {message && <p className={`banner driver-settings-message ${message.ok ? 'banner-success' : 'banner-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </section>
  );
}
