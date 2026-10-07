import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { getDrivers } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import Avatar from '../../../components/primitives/Avatar';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import DriverMfaRequirement from '../../sponsors/components/DriverMfaRequirement';
import LinkDriverForm from '../components/LinkDriverForm';
import '../Drivers.css';

export default function DriverListPage() {
  const { user } = useAuth();
  // Set by the driver page after a reject or drop.
  const notice = useLocation().state?.notice;
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadDrivers = useCallback(() => {
    setError(null);
    return getDrivers().then(setDrivers).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  const counts = useMemo(() => (drivers || []).reduce((result, driver) => ({
    ...result,
    total: result.total + 1,
    [driver.status]: (result[driver.status] || 0) + 1,
    points: result.points + Number(driver.point_balance || 0),
  }), { total: 0, approved: 0, pending: 0, points: 0 }), [drivers]);

  const visibleDrivers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (drivers || []).filter((driver) => (
      (statusFilter === 'all' || driver.status === statusFilter)
      && (!query
        || driver.name.toLocaleLowerCase().includes(query)
        || driver.username?.toLocaleLowerCase().includes(query))
    ));
  }, [drivers, search, statusFilter]);

  if (error) return (
    <main className="drivers-content">
      <StatePanel tone="error" title="Drivers couldn't be loaded">
        <p>{error}</p>
        <button className="drivers-button primary" type="button" onClick={loadDrivers}>Try again</button>
      </StatePanel>
    </main>
  );
  if (!drivers) return (
    <main className="drivers-content" aria-label="Loading drivers">
      <Skeleton className="drivers-skeleton drivers-skeleton-summary" />
      <Skeleton className="drivers-skeleton drivers-skeleton-list" />
    </main>
  );

  return (
    <div className="drivers-page">
      <PageHeader title="Drivers" subtitle="Manage enrollment, balances, and driver access" />
      <main className="drivers-content has-settings">
        <div className="drivers-primary">
          {notice && <p className="drivers-notice" role="status">{notice}</p>}
          <section className="drivers-summary" aria-label="Driver overview">
            <div><span>Total drivers</span><strong>{counts.total}</strong></div>
            <div><span>Approved</span><strong>{counts.approved}</strong></div>
            <div><span>Pending</span><strong>{counts.pending}</strong></div>
            <div><span>Total points</span><strong>{counts.points.toLocaleString()}</strong></div>
          </section>

          <section className="drivers-directory" aria-labelledby="drivers-directory-heading">
            <div className="drivers-directory-heading">
              <div><h2 id="drivers-directory-heading">Driver directory</h2><p>Select a driver to review details, adjust points, or manage enrollment.</p></div>
              {drivers.length > 0 && <span>{visibleDrivers.length} shown</span>}
            </div>

            {drivers.length > 0 && (
              <div className="drivers-toolbar">
                <label className="drivers-search" htmlFor="driver-search"><span className="sr-only">Search drivers</span><input id="driver-search" type="search" placeholder="Search by driver name" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                <div className="drivers-filters" role="group" aria-label="Filter by enrollment status">
                  {[
                    ['all', 'All', counts.total],
                    ['approved', 'Approved', counts.approved],
                    ['pending', 'Pending', counts.pending],
                  ].map(([value, label, count]) => (
                    <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}><span>{label}</span><small>{count}</small></button>
                  ))}
                </div>
              </div>
            )}

            {drivers.length === 0 ? (
              <div className="drivers-empty"><Avatar className="drivers-empty-avatar" name="No drivers" /><h3>No drivers linked yet</h3><p>Use the Link a driver panel to add someone from your organization.</p></div>
            ) : visibleDrivers.length === 0 ? (
              <div className="drivers-empty"><h3>No matching drivers</h3><p>Try another name or status filter.</p><button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</button></div>
            ) : (
              <div className="driver-card-grid">
                {visibleDrivers.map((driver) => (
                  <article className="driver-card" key={driver.id}>
                    <div className="driver-card-person"><Avatar className="driver-card-avatar" name={driver.name} /><div><h3>{driver.name}</h3><span className={`driver-status ${driver.status}`}>{driver.status === 'approved' ? 'Approved' : 'Pending approval'}</span></div></div>
                    <div className="driver-card-balance"><span>Point balance</span><strong>{Number(driver.point_balance || 0).toLocaleString()}</strong></div>
                    <Link to={`/drivers/${driver.id}`} aria-label={`View ${driver.name}`}>View driver <span aria-hidden="true">→</span></Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="drivers-settings" aria-label="Driver management settings">
          <LinkDriverForm onLinked={loadDrivers} />
          <DriverMfaRequirement company={user.company} />
        </aside>
      </main>
    </div>
  );
}
