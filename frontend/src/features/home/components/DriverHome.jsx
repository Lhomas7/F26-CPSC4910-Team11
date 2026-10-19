import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import { getDrivers, getPointHistory } from '../../../api';
import useApiRequest from '../../../hooks/useApiRequest';
import { PointHistoryList } from '../../points';
import DashboardCard from './DashboardCard';
import DashboardSkeleton from './DashboardSkeleton';
import QuickActions from './QuickActions';
import SectionError from './SectionError';
import WelcomeHeader from './WelcomeHeader';

const RECENT_ACTIVITY = 5;

export default function DriverHome({ user }) {
  const standing = useApiRequest(useCallback(() => getDrivers(), []));
  const activity = useApiRequest(
    useCallback(() => getPointHistory({ limit: RECENT_ACTIVITY }), []),
  );
  const record = standing.data?.[0];
  const linked = Boolean(record?.sponsor_name);
  const approved = linked && record?.status === 'approved';

  return (
    <div className="home-dashboard">
      <WelcomeHeader user={user} organization={standing.error ? null : record?.sponsor_name} />

      {record && !approved && (
        <p className="banner banner-warning home-guidance" role="status">
          {linked
            ? `${record.sponsor_name} must approve your enrollment before your points can change.`
            : 'A sponsor must link your account before you can participate in a program.'}
        </p>
      )}

      {standing.status === 'loading' && !record ? (
        <DashboardSkeleton count={3} type="stats" />
      ) : standing.error && !record ? (
        <section className="card">
          <SectionError
            error={standing.error}
            onRetry={standing.reload}
            title="Your program standing couldn't be loaded"
          />
        </section>
      ) : (
        <section className="stat-grid home-driver-stats" aria-label="Program standing">
          <div className="stat stat-highlight stat-lead">
            <span className="stat-label">Point balance</span>
            <strong className="stat-value">
              {Number(record?.point_balance || 0).toLocaleString()}
            </strong>
            <small className="stat-note">Across every sponsor</small>
          </div>
          <div className="stat">
            <span className="stat-label">Sponsor organization</span>
            <strong className="stat-value home-stat-text">
              {record?.sponsor_name || 'Not linked yet'}
            </strong>
            <small className="stat-note">Who manages your points</small>
          </div>
          <div className="stat">
            <span className="stat-label">Enrollment</span>
            <strong className="stat-value home-stat-badge">
              <span className={`badge badge-dot ${approved ? 'badge-success' : 'badge-warning'}`}>
                {approved ? 'Approved' : linked ? 'Pending approval' : 'Not enrolled'}
              </span>
            </strong>
            <small className="stat-note">
              {approved ? 'Can receive point changes' : 'Waiting to participate'}
            </small>
          </div>
        </section>
      )}

      <DashboardCard
        action={<Link to="/points">See all points</Link>}
        subtitle="Your five most recent changes. Times are in your local time zone."
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
            emptyText="No point changes yet. Your sponsor's awards and deductions will appear here."
          />
        ) : (
          <DashboardSkeleton type="activity" />
        )}
      </DashboardCard>

      <QuickActions>
        <Link className="button button-large button-primary" to="/points">
          View all points
        </Link>
        <Link className="button button-large" to="/account">
          My account
        </Link>
      </QuickActions>
    </div>
  );
}
