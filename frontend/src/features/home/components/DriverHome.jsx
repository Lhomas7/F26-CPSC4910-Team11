import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import { getPointHistory } from 'api';
import useApiRequest from 'hooks/useApiRequest';
import { PointHistoryList } from 'features/points';
import useDriverPointsRefresh from 'features/cart/useDriverPointsRefresh';
import { membershipStatus, useActiveSponsor } from 'features/sponsors';
import DashboardCard from './DashboardCard';
import DashboardSkeleton from './DashboardSkeleton';
import QuickActions from './QuickActions';
import SectionError from './SectionError';
import WelcomeHeader from './WelcomeHeader';

const RECENT_ACTIVITY = 5;

function guidanceFor(memberships, approved) {
  if (approved.length) return null;
  const pending = memberships.filter((membership) => membership.status === 'pending');
  if (pending.length) {
    const names = pending.map((membership) => membership.sponsor.name).join(', ');
    return `${names} must approve your application before you can earn or spend points.`;
  }
  return 'Apply to a sponsor to start earning points.';
}

/** One card per sponsor. Points never mix, so there is deliberately no total. */
function SponsorStandings({ memberships, activeSponsor }) {
  if (!memberships.length) {
    return (
      <section className="card home-no-sponsors">
        <p>You aren't with any sponsor yet.</p>
        <Link className="button button-primary" to="/sponsors">
          Apply to a sponsor
        </Link>
      </section>
    );
  }
  return (
    <section className="stat-grid home-sponsor-stats" aria-label="Your sponsors">
      {memberships.map((membership) => {
        const { label, badge } = membershipStatus(membership.status);
        const approved = membership.status === 'approved';
        const active = activeSponsor?.sponsor.id === membership.sponsor.id;
        return (
          <div
            className={`stat home-sponsor-stat${active ? ' stat-highlight' : ''}`}
            key={membership.sponsor.id}
          >
            <span className="stat-label">{membership.sponsor.name}</span>
            <strong className={approved ? 'stat-value' : 'stat-value home-stat-badge'}>
              {approved ? (
                <>
                  {Number(membership.point_balance || 0).toLocaleString()} <small>pts</small>
                </>
              ) : (
                <span className={`badge badge-dot ${badge}`}>{label}</span>
              )}
            </strong>
            <small className="stat-note">
              {active ? 'Shopping now' : approved ? 'Approved' : 'No points until approved'}
            </small>
          </div>
        );
      })}
    </section>
  );
}

export default function DriverHome({ user }) {
  const sponsors = useActiveSponsor();
  const activity = useApiRequest(
    useCallback(() => getPointHistory({ limit: RECENT_ACTIVITY }), []),
  );
  useDriverPointsRefresh(sponsors.reload, activity.reload);
  const { memberships, approved, activeSponsor, loaded } = sponsors;
  const guidance = loaded ? guidanceFor(memberships, approved) : null;

  return (
    <div className="home-dashboard">
      <WelcomeHeader user={user} organization={activeSponsor?.sponsor.name} />

      {guidance && memberships.length > 0 && (
        <p className="banner banner-warning home-guidance" role="status">
          {guidance}
        </p>
      )}

      {!loaded && sponsors.status === 'loading' ? (
        <DashboardSkeleton count={3} type="stats" />
      ) : !loaded ? (
        <section className="card">
          <SectionError
            error={sponsors.error}
            onRetry={sponsors.reload}
            title="Your sponsors couldn't be loaded"
          />
        </section>
      ) : (
        <SponsorStandings memberships={memberships} activeSponsor={activeSponsor} />
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
        <Link className="button button-large" to="/sponsors">
          Apply to more sponsors
        </Link>
        <Link className="button button-large" to="/account">
          My account
        </Link>
      </QuickActions>
    </div>
  );
}
