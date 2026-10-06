import { useEffect, useState } from 'react';

import { getSponsorMfaSetting, sponsorMfaSettings } from '../../../api';

export default function DriverMfaRequirement({ company }) {
  const [required, setRequired] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getSponsorMfaSetting()
      .then((data) => {
        setRequired(data.driver_mfa_required);
        setMessage(null);
      })
      .catch((error) => setMessage({ ok: false, text: error.message }));
  }, []);

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
    <form onSubmit={(event) => event.preventDefault()} className="driver-settings-card mfa-required-toggle">
      <div className="driver-settings-heading"><span aria-hidden="true">✓</span><div><h2>Driver security</h2><p>Set the sign-in requirement for your organization.</p></div></div>
      <label className="driver-setting-switch" htmlFor="require-mfa">
        <span><strong>Require driver MFA</strong><small>Drivers must configure two-factor authentication.</small></span>
        <input id="require-mfa" type="checkbox" checked={required === true} onChange={toggle} disabled={busy || required === null} />
      </label>
      <p className="mfa-required-hint">
        Applies to {company || 'your organization'}. Changing this setting notifies affected drivers.
      </p>
      {message && <p className={`driver-settings-message ${message.ok ? 'success' : 'error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </form>
  );
}
