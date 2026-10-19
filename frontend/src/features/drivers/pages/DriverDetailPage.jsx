import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { approveDriver, getDriver, getPointHistory } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import Avatar from '../../../components/primitives/Avatar';
import useApiRequest from '../../../hooks/useApiRequest';
import { PointHistoryList } from '../../points';
import PointAdjustmentPanel from '../components/PointAdjustmentPanel';
import RemoveDriverDialog from '../components/RemoveDriverDialog';
import '../Drivers.css';

// Sponsor-only workspace for enrollment decisions, point changes, and history.
export default function DriverDetailPage() {
  const { driverId } = useParams();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState('');

  const {
    data: driver,
    setData: setDriver,
    status,
    error,
    reload: loadDriver,
  } = useApiRequest(useCallback(() => getDriver(driverId), [driverId]));
  const {
    data: history,
    status: historyStatus,
    error: historyLoadError,
    reload: loadHistory,
  } = useApiRequest(useCallback(() => getPointHistory({ driver: driverId }), [driverId]));
  const historyError = historyStatus === 'error' ? historyLoadError.message : '';

  const approve = async () => {
    setSaving(true);
    setNotice('');
    setApproveError('');
    try {
      const updated = await approveDriver(driverId);
      setDriver(updated);
      setNotice(`${updated.name} is approved. You can now award and deduct points.`);
    } catch (requestError) {
      setApproveError(requestError.message || 'The driver could not be approved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const onRemoved = (record) => {
    const done = record.action === 'dropped' ? 'dropped' : 'rejected';
    navigate('/drivers', {
      state: { notice: `${driver.name} was ${done}. The reason has been saved.` },
    });
  };

  const title = driver?.name || 'Driver details';
  const breadcrumbName = driver?.name || '…';

  return (
    <div className="driver-detail-page">
      <PageHeader
        title={title}
        subtitle="Enrollment, points, and history"
        breadcrumb={
          <>
            <Link to="/drivers">Drivers</Link> / {breadcrumbName}
          </>
        }
      />
      <main className="driver-detail-content">
        {status === 'not-found' || status === 'error' ? (
          status === 'not-found' ? (
            <StatePanel headingLevel={1} title="That driver isn't in your organization">
              <p>
                They may have been dropped, or the link may be wrong. Search the driver directory to
                find the driver you&apos;re after.
              </p>
              <Link className="button button-primary" to="/drivers">
                Back to drivers
              </Link>
            </StatePanel>
          ) : (
            <StatePanel headingLevel={1} tone="error" title="This driver couldn't be loaded">
              <p>{error.message}</p>
              <div className="driver-state-actions">
                <button className="button button-primary" type="button" onClick={loadDriver}>
                  Try again
                </button>
                <Link className="button" to="/drivers">
                  Back to drivers
                </Link>
              </div>
            </StatePanel>
          )
        ) : !driver ? (
          <DriverDetailSkeleton />
        ) : (
          <>
            {approveError && (
              <p className="banner banner-error" role="alert">
                {approveError}
              </p>
            )}
            <DriverWorkspace
              driver={driver}
              history={history}
              historyError={historyError}
              saving={saving}
              notice={notice}
              onApprove={approve}
              onAdjust={(balance) => {
                setDriver((current) => ({ ...current, point_balance: balance }));
                loadHistory();
              }}
              onRetryHistory={loadHistory}
              onRemove={() => setRemoving(true)}
            />
          </>
        )}
      </main>

      {removing && (
        <RemoveDriverDialog
          driver={driver}
          onRemoved={onRemoved}
          onCancel={() => setRemoving(false)}
        />
      )}
    </div>
  );
}

function DriverWorkspace({
  driver,
  history,
  historyError,
  saving,
  notice,
  onApprove,
  onAdjust,
  onRetryHistory,
  onRemove,
}) {
  const pointBalance = Number(driver.point_balance ?? 0);
  const approved = driver.status === 'approved';

  return (
    <>
      {notice && (
        <p className="banner banner-success" role="status">
          {notice}
        </p>
      )}

      <section className="card driver-identity-card" aria-labelledby="driver-identity-name">
        <div className={`driver-identity ${driver.status}`}>
          <Avatar className="driver-identity-avatar" name={driver.name} />
          <div className="driver-identity-copy">
            <h2 id="driver-identity-name">{driver.name}</h2>
            <p className="driver-identity-username">@{driver.username}</p>
            <span
              className={`badge badge-dot ${driver.status === 'approved' ? 'badge-success' : 'badge-warning'}`}
            >
              {approved ? 'Approved' : 'Pending approval'}
            </span>
            <p className="driver-identity-organization">{driver.sponsor_name}</p>
          </div>
        </div>
        <div className="driver-headline">
          <div>
            <span>Current balance</span>
            <strong aria-label={`Current balance: ${pointBalance.toLocaleString()} points`}>
              {pointBalance.toLocaleString()} <small>pts</small>
            </strong>
            <p>Updated after every award or deduction</p>
          </div>
          <div>
            <span>Enrollment</span>
            <strong className="driver-enrollment-value">
              {approved ? 'Approved' : 'Pending approval'}
            </strong>
            <p>{approved ? 'Can receive point changes' : 'Waiting for your decision'}</p>
          </div>
        </div>
      </section>

      {!approved && (
        <>
          <section
            className="card driver-enrollment-card"
            aria-labelledby="driver-enrollment-heading"
          >
            <header>
              <h2 id="driver-enrollment-heading">Enrollment review</h2>
              <p>
                This driver applied to join {driver.sponsor_name || 'your organization'} and is
                waiting for your decision.
              </p>
            </header>
            <div>
              <ul>
                <li>Approving adds them to your driver list so you can award and deduct points.</li>
                <li>
                  Rejecting declines the application. A reason is required, and they can apply to
                  another sponsor.
                </li>
              </ul>
              <div className="driver-enrollment-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={onApprove}
                  disabled={saving}
                >
                  {saving ? 'Approving…' : 'Approve driver'}
                </button>
                <button
                  className="button button-danger-outline"
                  type="button"
                  onClick={onRemove}
                  disabled={saving}
                >
                  Reject application
                </button>
              </div>
            </div>
          </section>
          <div className="driver-adjustment-unavailable">
            <strong>Point adjustments are unavailable until this driver is approved</strong>
            Approve the application above to award or deduct points. Any existing balance is
            preserved.
          </div>
        </>
      )}

      {approved && (
        <PointAdjustmentPanel
          driverId={driver.id}
          driverName={driver.name}
          balance={pointBalance}
          onAdjusted={onAdjust}
        />
      )}

      <section className="card driver-history" aria-labelledby="driver-history-heading">
        <header>
          <h2 id="driver-history-heading">Point history</h2>
          <p>Newest first. Times are shown in your local time zone.</p>
        </header>
        <div className="driver-history-body" aria-busy={!history && !historyError}>
          {historyError ? (
            <div className="driver-history-error" role="alert">
              <div>
                <strong>Point history couldn&apos;t be loaded</strong>
                <p>
                  Everything else on this page is current. Recent point changes may not be shown
                  here until this loads.
                </p>
              </div>
              <button className="button" type="button" onClick={onRetryHistory}>
                Try again
              </button>
            </div>
          ) : history ? (
            <PointHistoryList
              detailStyle
              entries={history}
              emptyText={`No point changes for ${driver.name} yet.`}
            />
          ) : (
            <p className="point-history-empty" role="status">
              Loading history…
            </p>
          )}
        </div>
      </section>

      {approved && (
        <section className="driver-danger-area" aria-labelledby="driver-danger-heading">
          <h2 id="driver-danger-heading">Remove from organization</h2>
          <p>
            Dropping a driver ends their enrollment with{' '}
            {driver.sponsor_name || 'your organization'}.
          </p>
          <ul>
            <li>They are removed from your driver list and stop earning points from you.</li>
            <li>Their point history is preserved for your records.</li>
            <li>They can apply to another sponsor afterward.</li>
            <li>A reason is required and saved with the enrollment change for auditing.</li>
          </ul>
          <button className="button button-danger-outline" type="button" onClick={onRemove}>
            Drop driver
          </button>
        </section>
      )}
    </>
  );
}

function DriverDetailSkeleton() {
  return (
    <div className="driver-detail-loading" aria-label="Loading driver details">
      <section className="card driver-identity-card" aria-hidden="true">
        <div className="driver-identity">
          <Skeleton className="driver-detail-avatar-skeleton" />
          <div className="driver-detail-copy-skeleton">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        </div>
        <div className="driver-headline">
          <Skeleton />
          <Skeleton />
        </div>
      </section>
      <Skeleton className="driver-detail-panel-skeleton" />
      <Skeleton className="driver-detail-panel-skeleton tall" />
    </div>
  );
}
