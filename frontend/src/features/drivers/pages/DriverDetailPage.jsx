import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { getDriver, getPointHistory, updateDriver } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import StatePanel from '../../../components/feedback/StatePanel';
import PointHistoryList from '../../points/components/PointHistoryList';
import PointAdjustmentPanel from '../components/PointAdjustmentPanel';
import RemoveDriverDialog from '../components/RemoveDriverDialog';
import '../Drivers.css';

// Sponsors only (the route enforces it): review one driver, approve, reject
// or drop them, adjust points, and see their point history.
export default function DriverDetailPage() {
  const { driverId } = useParams();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadHistory = useCallback(() => (
    getPointHistory({ driver: driverId }).then(setHistory).catch(() => setHistory([]))
  ), [driverId]);

  useEffect(() => {
    getDriver(driverId).then(setDriver).catch((requestError) => setError(requestError.message));
    loadHistory();
  }, [driverId, loadHistory]);

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

  const onRemoved = (record) => {
    const done = record.action === 'dropped' ? 'dropped' : 'rejected';
    navigate('/drivers', { state: { notice: `${driver.name} was ${done}. The reason has been saved.` } });
  };

  if (error) {
    return (
      <main className="driver-detail-content">
        <StatePanel headingLevel={1} tone="error" title="This driver couldn't be loaded">
          <p>{error}</p>
          <Link className="drivers-button" to="/drivers">Back to drivers</Link>
        </StatePanel>
      </main>
    );
  }
  if (!driver) return <p className="driver-detail-content" role="status">Loading…</p>;

  const pointBalance = Number(driver.point_balance ?? 0);
  const approved = driver.status === 'approved';

  return (
    <div>
      <PageHeader
        title={driver.name}
        subtitle="Driver details"
        breadcrumb={<><Link to="/drivers">Drivers</Link> / {driver.name}</>}
      />
      <main className="driver-detail-content">
        <section className="driver-summary" aria-label="Driver summary">
          <div>
            <strong>Status</strong>
            <p><span className={`driver-status ${driver.status}`}>{approved ? 'Approved' : 'Pending approval'}</span></p>
          </div>
          <div><strong>Point balance</strong><p className="driver-balance">{pointBalance.toLocaleString()} pts</p></div>
          <div className="driver-summary-actions">
            {!approved && (
              <button className="drivers-button primary" type="button" onClick={approve} disabled={saving}>
                {saving ? 'Approving…' : 'Approve Driver'}
              </button>
            )}
            <button className="drivers-button danger" type="button" onClick={() => setRemoving(true)} disabled={saving}>
              {approved ? 'Drop driver' : 'Reject'}
            </button>
          </div>
        </section>

        {approved && (
          <PointAdjustmentPanel
            driverId={driver.id}
            balance={pointBalance}
            onAdjusted={(balance) => {
              setDriver((current) => ({ ...current, point_balance: balance }));
              loadHistory();
            }}
          />
        )}

        <section className="driver-history" aria-labelledby="driver-history-heading">
          <h2 id="driver-history-heading">Point history</h2>
          {history
            ? <PointHistoryList entries={history} emptyText={`No point changes for ${driver.name} yet.`} />
            : <p className="point-history-empty" role="status">Loading history…</p>}
        </section>
      </main>

      {removing && <RemoveDriverDialog driver={driver} onRemoved={onRemoved} onCancel={() => setRemoving(false)} />}
    </div>
  );
}
