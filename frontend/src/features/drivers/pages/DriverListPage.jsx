import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { getDrivers } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import Avatar from '../../../components/primitives/Avatar';
import { SearchIcon } from '../../../components/primitives/Icons';
import useApiRequest from '../../../hooks/useApiRequest';
import { DriverMfaRequirement } from '../../sponsors';
import LinkDriverForm from '../components/LinkDriverForm';
import '../Drivers.css';

const FILTERS = [
  ['all', 'Total drivers', 'Show all drivers'],
  ['approved', 'Approved', 'Show approved only'],
  ['pending', 'Pending', 'Show pending only'],
];

export default function DriverListPage() {
  const { user } = useAuth();
  const routeNotice = useLocation().state?.notice;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [notice, setNotice] = useState(routeNotice || '');

  const {
    data: drivers,
    status,
    error,
    reload: loadDrivers,
  } = useApiRequest(useCallback(() => getDrivers(), []));

  const counts = useMemo(
    () =>
      (drivers || []).reduce(
        (result, driver) => ({
          ...result,
          total: result.total + 1,
          [driver.status]: (result[driver.status] || 0) + 1,
          points: result.points + Number(driver.point_balance || 0),
        }),
        { total: 0, approved: 0, pending: 0, points: 0 },
      ),
    [drivers],
  );

  const visibleDrivers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (drivers || []).filter(
      (driver) =>
        (statusFilter === 'all' || driver.status === statusFilter) &&
        (!query ||
          driver.name.toLocaleLowerCase().includes(query) ||
          driver.username?.toLocaleLowerCase().includes(query)),
    );
  }, [drivers, search, statusFilter]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  const handleLinked = async (driver) => {
    await loadDrivers();
    setNotice(
      `@${driver.username} was linked to ${user.company || 'your organization'} and is waiting for approval.`,
    );
  };

  if (status !== 'loading' && status !== 'ready')
    return (
      <div className="drivers-page">
        <PageHeader title="Drivers" subtitle="Manage enrollment, balances, and driver access" />
        <main className="drivers-content">
          <StatePanel tone="error" title="Drivers couldn't be loaded">
            <p>{error.message}</p>
            <button className="button button-primary" type="button" onClick={loadDrivers}>
              Try again
            </button>
          </StatePanel>
        </main>
      </div>
    );

  if (!drivers)
    return (
      <div className="drivers-page">
        <PageHeader title="Drivers" subtitle="Manage enrollment, balances, and driver access" />
        <main className="drivers-content" aria-label="Loading drivers">
          <div className="drivers-summary" aria-hidden="true">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="drivers-skeleton drivers-skeleton-summary" />
            ))}
          </div>
          <Skeleton className="drivers-skeleton drivers-skeleton-list" />
        </main>
      </div>
    );

  const hasFilters = Boolean(search.trim()) || statusFilter !== 'all';

  return (
    <div className="drivers-page">
      <PageHeader title="Drivers" subtitle="Manage enrollment, balances, and driver access" />
      <main className="drivers-content">
        {notice && (
          <div className="banner banner-success drivers-notice" role="status">
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}

        {drivers.length > 0 && (
          <section className="drivers-summary" aria-label="Driver overview">
            {FILTERS.map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                className={`stat${value === 'pending' ? ' stat-warning' : ''}`}
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                <span className="stat-label">{label}</span>
                <strong className="stat-value">{counts[value === 'all' ? 'total' : value]}</strong>
                <small className="stat-note">{hint}</small>
              </button>
            ))}
            <div className="stat">
              <span className="stat-label">Total points</span>
              <strong className="stat-value">{counts.points.toLocaleString()}</strong>
              <small className="stat-note">Held by your drivers</small>
            </div>
          </section>
        )}

        <section className="drivers-directory" aria-labelledby="drivers-directory-heading">
          <div className="drivers-directory-heading">
            <div>
              <h2 id="drivers-directory-heading">Driver directory</h2>
              <p>Select a driver to review enrollment, adjust points, or see their history.</p>
            </div>
          </div>

          {drivers.length > 0 && (
            <>
              <div className="drivers-toolbar">
                <label className="drivers-search" htmlFor="driver-search">
                  <SearchIcon className="drivers-search-icon" size={15} />
                  <span className="sr-only">Search drivers</span>
                  <input
                    id="driver-search"
                    type="search"
                    aria-label="Search drivers"
                    placeholder="Search by driver name or username"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <div
                  className="drivers-filters"
                  role="group"
                  aria-label="Filter by enrollment status"
                >
                  {[
                    ['all', 'All', counts.total],
                    ['approved', 'Approved', counts.approved],
                    ['pending', 'Pending', counts.pending],
                  ].map(([value, label, count]) => (
                    <button
                      key={value}
                      className="chip"
                      type="button"
                      aria-pressed={statusFilter === value}
                      onClick={() => setStatusFilter(value)}
                    >
                      <span className="chip-content">
                        <span>{label}</span>
                        <span className="chip-count">{count}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <LinkDriverForm
                  company={user.company}
                  onLinked={handleLinked}
                  triggerClassName="drivers-toolbar-action"
                />
              </div>
              <p className="drivers-count" aria-live="polite">
                {hasFilters
                  ? `Showing ${visibleDrivers.length} of ${drivers.length} drivers`
                  : `${drivers.length} drivers`}
              </p>
            </>
          )}

          {drivers.length === 0 ? (
            <StatePanel title="No drivers linked yet">
              <p>
                Add an existing driver account to your organization by username. Once linked, you
                can approve their enrollment and start awarding points.
              </p>
              <LinkDriverForm company={user.company} onLinked={handleLinked} />
            </StatePanel>
          ) : visibleDrivers.length === 0 ? (
            <StatePanel
              title={
                search.trim()
                  ? `No drivers match “${search.trim()}”`
                  : `No ${statusFilter} drivers yet`
              }
            >
              <p>
                Try a different name or username, or clear the search and filters to see everyone.
              </p>
              <button className="button" type="button" onClick={clearFilters}>
                Clear search and filters
              </button>
            </StatePanel>
          ) : (
            <div className="driver-card-grid">
              {visibleDrivers.map((driver) => (
                <article className={`card driver-card ${driver.status}`} key={driver.id}>
                  <div className="driver-card-person">
                    <Avatar className="driver-card-avatar" name={driver.name} />
                    <div>
                      <h3>
                        <Link to={`/drivers/${driver.id}`} aria-label={`View ${driver.name}`}>
                          {driver.name}
                        </Link>
                      </h3>
                      <p className="driver-card-username">@{driver.username}</p>
                      <span
                        className={`badge badge-dot ${driver.status === 'approved' ? 'badge-success' : 'badge-warning'}`}
                      >
                        {driver.status === 'approved' ? 'Approved' : 'Pending approval'}
                      </span>
                    </div>
                  </div>
                  <div className="driver-card-balance">
                    <span>Point balance</span>
                    <strong>
                      {Number(driver.point_balance || 0).toLocaleString()} <small>pts</small>
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <DriverMfaRequirement company={user.company} />
      </main>
    </div>
  );
}
