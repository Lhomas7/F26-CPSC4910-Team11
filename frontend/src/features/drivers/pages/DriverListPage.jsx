import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDrivers } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import Avatar from '../../../components/primitives/Avatar';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import SelectMenu from '../../../components/forms/SelectMenu';
import DriverMfaRequirement from '../../sponsors/components/DriverMfaRequirement';
import LinkDriverForm from '../components/LinkDriverForm';
import '../Drivers.css';

// Page wording per account type. Sponsors manage their company's drivers,
// admins get a read-only overview of every driver, drivers see their own record.
const COPY = {
  sponsor: {
    title: 'Drivers',
    subtitle: 'Manage enrollment, balances, and driver access',
    directory: 'Driver directory',
    hint: 'Select a driver to review details or adjust points.',
    emptyTitle: 'No drivers linked yet',
    emptyText: 'Use the Link a driver panel to add someone from your organization.',
  },
  admin: {
    title: 'All drivers',
    subtitle: 'Every driver across all sponsor organizations',
    directory: 'Driver directory',
    hint: 'Select a driver to open their account.',
    emptyTitle: 'No drivers yet',
    emptyText: 'Drivers appear here once they register.',
  },
  driver: {
    title: 'My driver profile',
    subtitle: 'Review your enrollment and point balance',
    directory: 'Driver record',
    hint: 'Select a driver to review details.',
    emptyTitle: 'No driver record yet',
    emptyText: 'Your driver record will appear here once it has been set up.',
  },
};

export default function DriverListPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [organization, setOrganization] = useState('all');

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

  // Admins can narrow the overview to one sponsor organization (or drivers without one).
  const organizationOptions = useMemo(() => {
    const names = new Map();
    (drivers || []).forEach((driver) => {
      if (driver.sponsor) names.set(String(driver.sponsor), driver.sponsor_name || `Organization ${driver.sponsor}`);
    });
    return [
      { value: 'all', label: 'All organizations' },
      ...[...names].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
      ...((drivers || []).some((driver) => !driver.sponsor) ? [{ value: 'unassigned', label: 'No sponsor' }] : []),
    ];
  }, [drivers]);

  const visibleDrivers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (drivers || []).filter((driver) => (
      (statusFilter === 'all' || driver.status === statusFilter)
      && (organization === 'all'
        || (organization === 'unassigned' ? !driver.sponsor : String(driver.sponsor) === organization))
      && (!query || driver.name.toLocaleLowerCase().includes(query))
    ));
  }, [drivers, search, statusFilter, organization]);

  const isSponsor = user?.account_type === 'sponsor';
  const isAdmin = user?.account_type === 'admin';
  const copy = COPY[isSponsor ? 'sponsor' : isAdmin ? 'admin' : 'driver'];

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
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <main className={`drivers-content${isSponsor ? ' has-settings' : ''}`}>
        <div className="drivers-primary">
          <section className="drivers-summary" aria-label="Driver overview">
            <div><span>Total drivers</span><strong>{counts.total}</strong></div>
            <div><span>Approved</span><strong>{counts.approved}</strong></div>
            <div><span>Pending</span><strong>{counts.pending}</strong></div>
            <div><span>Total points</span><strong>{counts.points.toLocaleString()}</strong></div>
          </section>

          <section className="drivers-directory" aria-labelledby="drivers-directory-heading">
            <div className="drivers-directory-heading">
              <div><h2 id="drivers-directory-heading">{copy.directory}</h2><p>{copy.hint}</p></div>
              {drivers.length > 0 && <span>{visibleDrivers.length} shown</span>}
            </div>

            {drivers.length > 0 && (
              <div className="drivers-toolbar">
                <label className="drivers-search" htmlFor="driver-search"><span className="sr-only">Search drivers</span><input id="driver-search" type="search" placeholder="Search by driver name" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                {isAdmin && (
                  <SelectMenu
                    className="drivers-organization-filter"
                    label="Filter by sponsor organization"
                    value={organization}
                    options={organizationOptions}
                    onChange={setOrganization}
                  />
                )}
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
              <div className="drivers-empty"><Avatar className="drivers-empty-avatar" name="No drivers" /><h3>{copy.emptyTitle}</h3><p>{copy.emptyText}</p></div>
            ) : visibleDrivers.length === 0 ? (
              <div className="drivers-empty"><h3>No matching drivers</h3><p>Try another name or status filter.</p><button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); setOrganization('all'); }}>Clear filters</button></div>
            ) : (
              <div className="driver-card-grid">
                {visibleDrivers.map((driver) => (
                  <article className="driver-card" key={driver.id}>
                    <div className="driver-card-person"><Avatar className="driver-card-avatar" name={driver.name} /><div><h3>{driver.name}</h3><span className={`driver-status ${driver.status}`}>{driver.status === 'approved' ? 'Approved' : 'Pending approval'}</span>{isAdmin && <p className="driver-card-org">{driver.sponsor_name || 'No sponsor'}</p>}</div></div>
                    <div className="driver-card-balance"><span>Point balance</span><strong>{Number(driver.point_balance || 0).toLocaleString()}</strong></div>
                    {isAdmin ? (
                      <Link to={`/users/drivers/${driver.user}`} aria-label={`Open ${driver.name}'s account`}>Open account <span aria-hidden="true">→</span></Link>
                    ) : (
                      <Link to={`/drivers/${driver.id}`} aria-label={`View ${driver.name}`}>View driver <span aria-hidden="true">→</span></Link>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {isSponsor && (
          <aside className="drivers-settings" aria-label="Driver management settings">
            <LinkDriverForm onLinked={loadDrivers} />
            <DriverMfaRequirement company={user.company} />
          </aside>
        )}
      </main>
    </div>
  );
}
