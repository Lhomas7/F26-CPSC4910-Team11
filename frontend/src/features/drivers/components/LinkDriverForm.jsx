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
    <form onSubmit={submit}>
      <label htmlFor="link-username">Link a driver by username</label>
      <input id="link-username" value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" spellCheck="false" />
      <button type="submit" disabled={busy || !username.trim()}>{busy ? 'Linking…' : 'Link Driver'}</button>
      {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </form>
  );
}
