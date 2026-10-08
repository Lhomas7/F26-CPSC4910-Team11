import { Link } from 'react-router-dom';

import { getAdminUsers, getDrivers, getPointHistory } from '../../../api';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import useApiRequest from '../../../hooks/useApiRequest';
import { PointHistoryList } from '../../points';

const RECENT_ACTIVITY = 5;

/** Runs a module-level `load` once; `data` stays null until it resolves. */
function useHomeData(load) {
  const { data, error } = useApiRequest(load);
  return { data, error: error?.message ?? null };
}

function Stats({ items }) {
  return (
    <section className="home-stats" aria-label="Summary">
      {items.map(([label, value], index) => (
        <div key={label} className={`stat${index === 0 ? ' stat-highlight' : ''}`}>
          <span className="stat-label">{label}</span>
          <strong className="stat-value">{value}</strong>
        </div>
      ))}
    </section>
  );
}

function Card({ title, action, children }) {
  return (
    <section className="card home-card" aria-label={title}>
      <div className="home-card-heading">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Loading({ error }) {
  if (error) {
    return (
      <StatePanel tone="error" title="Your dashboard couldn't be loaded">
        <p>{error}</p>
      </StatePanel>
    );
  }
  return <Skeleton className="home-skeleton" />;
}

const loadDriverHome = () =>
  Promise.all([getDrivers(), getPointHistory({ limit: RECENT_ACTIVITY })]).then(
    ([drivers, history]) => ({ record: drivers[0], history }),
  );

function DriverHome() {
  const { data, error } = useHomeData(loadDriverHome);
  if (!data) return <Loading error={error} />;
  const { record, history } = data;

  return (
    <>
      <Stats
        items={[
          ['Point balance', Number(record?.point_balance || 0).toLocaleString()],
          ['Sponsor', record?.sponsor_name || 'Not linked yet'],
          ['Status', record?.status === 'approved' ? 'Approved' : 'Pending approval'],
        ]}
      />
      <Card title="Recent point activity" action={<Link to="/points">See all points</Link>}>
        <PointHistoryList entries={history} emptyText="No point changes yet." />
      </Card>
    </>
  );
}

const loadSponsorHome = () =>
  Promise.all([getDrivers(), getPointHistory({ limit: RECENT_ACTIVITY })]).then(
    ([drivers, history]) => ({ drivers, history }),
  );

function SponsorHome() {
  const { data, error } = useHomeData(loadSponsorHome);
  if (!data) return <Loading error={error} />;
  const { drivers, history } = data;
  const pending = drivers.filter((driver) => driver.status === 'pending');
  const points = drivers.reduce((sum, driver) => sum + Number(driver.point_balance || 0), 0);

  return (
    <>
      <Stats
        items={[
          ['Drivers', drivers.length],
          ['Pending applications', pending.length],
          ['Points held by drivers', points.toLocaleString()],
        ]}
      />
      <div className="home-columns">
        <Card title="Pending applications" action={<Link to="/drivers">All drivers</Link>}>
          {pending.length ? (
            <ul className="home-list">
              {pending.slice(0, RECENT_ACTIVITY).map((driver) => (
                <li key={driver.id}>
                  <span>{driver.name}</span>
                  <Link to={`/drivers/${driver.id}`} aria-label={`Review ${driver.name}`}>
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-empty">No applications waiting.</p>
          )}
        </Card>
        <Card title="Recent driver activity" action={<Link to="/points">All points</Link>}>
          <PointHistoryList
            entries={history}
            showDriver
            linkDrivers
            emptyText="No point changes yet."
          />
        </Card>
      </div>
    </>
  );
}

const loadAdminHome = () => getAdminUsers();

function AdminHome() {
  const { data, error } = useHomeData(loadAdminHome);
  if (!data) return <Loading error={error} />;
  const users = Array.isArray(data) ? data : [];
  const count = (role) => users.filter((current) => current.role === role).length;
  const unassigned = users.filter(
    (current) => current.role === 'driver' && !current.sponsor_org,
  ).length;

  return (
    <>
      <Stats
        items={[
          ['Drivers', count('driver')],
          ['Sponsors', count('sponsor')],
          ['Admins', count('admin')],
          ['Drivers without a sponsor', unassigned],
        ]}
      />
      <Card title="Shortcuts">
        <ul className="home-list">
          <li>
            <span>Review and update driver, sponsor and admin accounts</span>
            <Link to="/users">Users</Link>
          </li>
          <li>
            <span>Create a new account</span>
            <Link to="/users/new">Add a user</Link>
          </li>
          <li>
            <span>Edit the product and release details</span>
            <Link to="/about">About page</Link>
          </li>
        </ul>
      </Card>
    </>
  );
}

const DASHBOARDS = { driver: DriverHome, sponsor: SponsorHome, admin: AdminHome };

/** The signed-in part of Home: a different dashboard for each account type. */
export default function HomeDashboard({ accountType }) {
  const Dashboard = DASHBOARDS[accountType];
  if (!Dashboard) return null;
  return (
    <div className="home-dashboard">
      <Dashboard />
    </div>
  );
}
