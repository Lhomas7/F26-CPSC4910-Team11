import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getDriver, getDrivers, updateDriver } from '../config/api';

export function DriverList() {
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
  if (drivers.length === 0) return <p>No drivers assigned yet.</p>;

  return (
    <ul>
      {drivers.map((d) => (
        <li key={d.id} onClick={() => navigate(`/drivers/${d.id}`)}>
          {d.name} — {d.status}
        </li>
      ))}
    </ul>
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