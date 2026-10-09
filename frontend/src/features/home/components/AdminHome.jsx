import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import { getAdminSponsorOrganizations, getAdminUsers } from '../../../api';
import useApiRequest from '../../../hooks/useApiRequest';
import DashboardCard from './DashboardCard';
import DashboardSkeleton from './DashboardSkeleton';
import QuickActions from './QuickActions';
import SectionError from './SectionError';
import WelcomeHeader from './WelcomeHeader';

export default function AdminHome({ user }) {
  const accountsRequest = useApiRequest(useCallback(() => getAdminUsers(), []));
  const organizationsRequest = useApiRequest(useCallback(() => getAdminSponsorOrganizations(), []));
  const accounts = accountsRequest.data
    ? Array.isArray(accountsRequest.data)
      ? accountsRequest.data
      : []
    : null;
  const organizations = organizationsRequest.data
    ? Array.isArray(organizationsRequest.data)
      ? organizationsRequest.data
      : []
    : null;
  const countRole = (role) => (accounts || []).filter((account) => account.role === role).length;
  const active = (accounts || []).filter((account) => account.is_active).length;
  const inactive = (accounts || []).length - active;
  const unassigned = (accounts || []).filter(
    (account) => account.role === 'driver' && !account.sponsor_org,
  ).length;

  return (
    <div className="home-dashboard">
      <WelcomeHeader user={user} />

      {accountsRequest.status === 'loading' && !accounts ? (
        <DashboardSkeleton count={4} type="stats" />
      ) : accountsRequest.error && !accounts ? (
        <section className="card">
          <SectionError
            error={accountsRequest.error}
            onRetry={accountsRequest.reload}
            title="The account list couldn't be loaded"
          />
        </section>
      ) : (
        <section className="stat-grid" aria-label="Account summary">
          <div className="stat stat-highlight stat-lead">
            <span className="stat-label">Total accounts</span>
            <strong className="stat-value">{accounts.length}</strong>
            <small className="stat-note">Every role combined</small>
          </div>
          <div className="stat">
            <span className="stat-label">Drivers</span>
            <strong className="stat-value">{countRole('driver')}</strong>
            <small className="stat-note">Enrolled driver accounts</small>
          </div>
          <div className="stat">
            <span className="stat-label">Sponsor users</span>
            <strong className="stat-value">{countRole('sponsor')}</strong>
            <small className="stat-note">People managing programs</small>
          </div>
          <div className="stat">
            <span className="stat-label">Administrators</span>
            <strong className="stat-value">{countRole('admin')}</strong>
            <small className="stat-note">Including you</small>
          </div>
        </section>
      )}

      {accounts && (
        <DashboardCard
          action={<Link to="/users">Manage users</Link>}
          subtitle="What may need an administrator's attention."
          title="Account health"
        >
          <dl className="home-health-list">
            <div>
              <dt>Active accounts</dt>
              <dd>{active}</dd>
            </div>
            <div>
              <dt>
                Inactive accounts <small>Cannot sign in</small>
              </dt>
              <dd>{inactive}</dd>
            </div>
            <div>
              <dt>
                Drivers without a sponsor <small>Not linked to an organization yet</small>
              </dt>
              <dd>{unassigned}</dd>
            </div>
            <div>
              <dt>
                Sponsor organizations <small>Companies running a program</small>
              </dt>
              <dd>
                {organizationsRequest.error && !organizations ? (
                  <span className="home-health-unavailable">Unavailable</span>
                ) : organizations ? (
                  organizations.length
                ) : (
                  <span className="home-health-unavailable">Loading…</span>
                )}
              </dd>
            </div>
          </dl>
          {organizationsRequest.error && !organizations && (
            <SectionError
              error={organizationsRequest.error}
              onRetry={organizationsRequest.reload}
              title="The organization count couldn't be loaded"
            />
          )}
        </DashboardCard>
      )}

      <QuickActions>
        <Link className="button button-large button-primary" to="/users">
          Manage users
        </Link>
        <Link className="button button-large" to="/users/new">
          Add user
        </Link>
        <Link className="button button-large" to="/about">
          Edit About
        </Link>
      </QuickActions>
    </div>
  );
}
