import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getDrivers } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import DriverMfaRequirement from '../../sponsors/components/DriverMfaRequirement';
import LinkDriverForm from '../components/LinkDriverForm';
import '../Drivers.css';

export default function DriverListPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const loadDrivers = useCallback(() => {
    setError(null);
    return getDrivers().then(setDrivers).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  if (error) return <p role="alert">Could not load drivers: {error}</p>;
  if (!drivers) return <p>Loading…</p>;

  return (
    <>
      <PageHeader title="Drivers" subtitle="Manage drivers and enrollment" />
      {drivers.length === 0 ? (
        <p>No drivers assigned yet.</p>
      ) : (
        <ul>
          {drivers.map((driver) => (
            <li key={driver.id} onClick={() => navigate(`/drivers/${driver.id}`)}>
              {driver.name} — {driver.status}
            </li>
          ))}
        </ul>
      )}
      {user?.account_type === 'sponsor' && (
        <>
          <DriverMfaRequirement company={user.company} />
          <LinkDriverForm onLinked={loadDrivers} />
        </>
      )}
    </>
  );
}
