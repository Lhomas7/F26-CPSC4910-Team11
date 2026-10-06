import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { getDriver, updateDriver } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import PointAdjustmentPanel from '../components/PointAdjustmentPanel';
import '../Drivers.css';

export default function DriverDetailPage() {
  const { user } = useAuth();
  const { driverId } = useParams();
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDriver(driverId).then(setDriver).catch((requestError) => setError(requestError.message));
  }, [driverId]);

  const approve = async () => {
    setSaving(true);
    try {
      const updated = await updateDriver(driverId, { status: 'approved' });
      setDriver(updated);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p role="alert">Could not load driver: {error}</p>;
  if (!driver) return <p>Loading…</p>;
  const pointBalance = Number(driver.point_balance ?? 0);

  return (
    <div>
      <PageHeader title={driver.name} subtitle="Driver details" />
      <main className="driver-detail-content">
        <section className="driver-summary" aria-label="Driver summary">
          <div><strong>Status</strong><p>{driver.status}</p></div>
          <div><strong>Point balance</strong><p className="driver-balance">{pointBalance.toLocaleString()} pts</p></div>
          {driver.status === 'pending' && <button type="button" onClick={approve} disabled={saving}>{saving ? 'Approving…' : 'Approve Driver'}</button>}
        </section>
        {user?.account_type === 'sponsor' && driver.status === 'approved' && (
          <PointAdjustmentPanel
            driverId={driver.id}
            balance={pointBalance}
            onAdjusted={(balance) => setDriver((current) => ({ ...current, point_balance: balance }))}
          />
        )}
      </main>
    </div>
  );
}
