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
    <form onSubmit={(event) => event.preventDefault()} className="mfa-required-toggle">
      <label htmlFor="require-mfa">
        <input id="require-mfa" type="checkbox" checked={required === true} onChange={toggle} disabled={busy || required === null} />
        Require drivers to enable MFA
      </label>
      <p className="mfa-required-hint">
        {company ? `${company} drivers` : 'Your drivers'} must set up two-factor
        authentication before they are considered enrolled. Changing this
        requirement notifies every affected driver by notification and email.
      </p>
      {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </form>
  );
}
