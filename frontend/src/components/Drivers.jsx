import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { getDriver, getDrivers, linkDriver, updateDriver } from '../config/api';

export function DriverList() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getDrivers()
      .then(setDrivers)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p role="alert">Could not load drivers: {error}</p>;
  if (!drivers) return <p>Loading…</p>;

  return (
    <>
      {drivers.length === 0 ? (
        <p>No drivers assigned yet.</p>
      ) : (
        <ul>
          {drivers.map((d) => (
            <li key={d.id} onClick={() => navigate(`/drivers/${d.id}`)}>
              {d.name} — {d.status}
            </li>
          ))}
        </ul>
      )}
      {user?.account_type === 'sponsor' && (
        <LinkDriver
          onLinked={() =>
            getDrivers()
              .then(setDrivers)
              .catch((err) => setError(err.message))
          }
        />
      )}
    </>
  );
}

function LinkDriver({ onLinked }) {
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
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor="link-username">Link a driver by username</label>
      <input
        id="link-username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoCapitalize="none"
        spellCheck="false"
      />
      <button type="submit" disabled={busy || !username.trim()}>
        {busy ? 'Linking…' : 'Link Driver'}
      </button>
      {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </form>
  );
}

export function DriverDetail() {
  const { driverId } = useParams();
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDriver(driverId)
      .then(setDriver)
      .catch((err) => setError(err.message));
  }, [driverId]);

  const approve = async () => {
    setSaving(true);
    try {
      const updated = await updateDriver(driverId, { status: 'approved' });
      setDriver(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p role="alert">Could not load driver: {error}</p>;
  if (!driver) return <p>Loading…</p>;

  return (
    <div>
      <h2>{driver.name}</h2>
      <p>Status: {driver.status}</p>
      {driver.status === 'pending' && (
        <button type="button" onClick={approve} disabled={saving}>
          {saving ? 'Approving…' : 'Approve Driver'}
        </button>
      )}
    </div>
  );
}