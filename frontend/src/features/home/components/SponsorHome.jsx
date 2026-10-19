import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDrivers, getPointHistory } from '../../../api';
import useApiRequest from '../../../hooks/useApiRequest';
import LinkDriverForm from '../../drivers/components/LinkDriverForm';
import { PointHistoryList } from '../../points';
import DashboardCard from './DashboardCard';
import DashboardSkeleton from './DashboardSkeleton';
import QuickActions from './QuickActions';
import SectionError from './SectionError';
import WelcomeHeader from './WelcomeHeader';

const RECENT_ACTIVITY = 5;

export default function SponsorHome({ user }) {
  const [notice, setNotice] = useState('');
  const driversRequest = useApiRequest(useCallback(() => getDrivers(), []));
  const activity = useApiRequest(
    useCallback(() => getPointHistory({ limit: RECENT_ACTIVITY }), []),
  );
  const drivers = driversRequest.data;
  const pending = (drivers || []).filter((driver) => driver.status === 'pending');
  const approved = (drivers || []).filter((driver) => driver.status === 'approved');
  const points = (drivers || []).reduce(
    (total, driver) => total + Number(driver.point_balance || 0),
    0,
  );

  const handleLinked = async (driver) => {
    await driversRequest.reload();
    setNotice(`@${driver.username} was linked and is waiting for approval.`);
  };

  return (
    <div className="home-dashboard">
      <WelcomeHeader user={user} organization={user.company} />
      {notice && (
        <p className="banner banner-success" role="status">
          {notice}
        </p>
      )}

      {driversRequest.status === 'loading' && !drivers ? (
        <DashboardSkeleton count={4} type="stats" />
      ) : driversRequest.error && !drivers ? (
        <section className="card">
          <SectionError
            error={driversRequest.error}
            onRetry={driversRequest.reload}
            title="Your driver summary couldn't be loaded"
          />
        </section>
      ) : (
        <section className="stat-grid" aria-label="Program summary">
          <div className="stat">
            <span className="stat-label">Linked drivers</span>
            <strong className="stat-value">{drivers.length}</strong>
            <small className="stat-note">In {user.company || 'your organization'}</small>
          </div>
          <div className="stat">
            <span className="stat-label">Approved</span>
            <strong className="stat-value">{approved.length}</strong>
            <small className="stat-note">Can receive points</small>
          </div>
          <div className="stat stat-warning">
            <span className="stat-label">Pending</span>
            <strong className="stat-value">{pending.length}</strong>
            <small className="stat-note">Awaiting your decision</small>
          </div>
          <div className="stat stat-highlight">
            <span className="stat-label">Points held by drivers</span>
            <strong className="stat-value">{points.toLocaleString()}</strong>
            <small className="stat-note">Total of every balance</small>
          </div>
        </section>
      )}

      <div className={`home-columns${driversRequest.error && !drivers ? ' single' : ''}`}>
        {drivers && (
          <DashboardCard
            action={<Link to="/drivers">All drivers</Link>}
            subtitle="Drivers waiting on an enrollment decision."
            title="Needs your attention"
          >
            {pending.length ? (
              <ul className="home-attention-list">
                {pending.slice(0, RECENT_ACTIVITY).map((driver) => (
                  <li key={driver.id}>
                    <span className="home-attention-person">
                      <strong>{driver.name}</strong>
                      <small>@{driver.username} · Pending approval</small>
                    </span>
                    <Link
                      aria-label={`Review ${driver.name}`}
                      className="button"
                      to={`/drivers/${driver.id}`}
                    >
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="home-empty">
                <strong>No drivers are waiting.</strong>
                New enrollment requests will appear here.
              </p>
            )}
          </DashboardCard>
        )}

        <DashboardCard
          action={<Link to="/points">All points</Link>}
          subtitle="Your five most recent changes."
          title="Recent point activity"
        >
          {activity.error && !activity.data ? (
            <SectionError
              error={activity.error}
              onRetry={activity.reload}
              title="Recent activity couldn't be loaded"
            />
          ) : activity.data ? (
            <PointHistoryList
              detailStyle
              entries={activity.data}
              emptyText="No point changes yet. Awards and deductions will appear here."
              linkDrivers
              showDriver
            />
          ) : (
            <DashboardSkeleton type="activity" />
          )}
        </DashboardCard>
      </div>

      <QuickActions>
        <Link className="button button-large button-primary" to="/drivers">
          Go to drivers
        </Link>
        <Link className="button button-large" to="/points">
          View points
        </Link>
        <LinkDriverForm
          company={user.company}
          primary={false}
          triggerClassName="button-large"
          onLinked={handleLinked}
        />
      </QuickActions>
    </div>
  );
}
