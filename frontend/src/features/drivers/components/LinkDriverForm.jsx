import { useState } from 'react';

import { linkDriver } from '../../../api';

export default function LinkDriverForm({ onLinked }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await linkDriver(username.trim());
      setUsername('');
      setMessage({ ok: true, text: 'Driver linked.' });
      onLinked();
    } catch (error) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="driver-settings-card link-driver-form" onSubmit={submit}>
      <div className="driver-settings-heading"><span aria-hidden="true">+</span><div><h2>Link a driver</h2><p>Add an existing driver account to your organization.</p></div></div>
      <label htmlFor="link-username">Driver username</label>
      <input id="link-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. jamie.rivera" autoComplete="username" autoCapitalize="none" spellCheck="false" />
      <button className="drivers-button primary" type="submit" disabled={busy || !username.trim()}>{busy ? 'Linking…' : 'Link driver'}</button>
      {message && <p className={`driver-settings-message ${message.ok ? 'success' : 'error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </form>
  );
}
