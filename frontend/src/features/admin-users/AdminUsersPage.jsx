import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import PageHeader from '../../app/PageHeader';
import Skeleton from '../../components/feedback/Skeleton';
import StatePanel from '../../components/feedback/StatePanel';
import SelectMenu from '../../components/forms/SelectMenu';
import Avatar from '../../components/primitives/Avatar';
import RegistrationSettingsPanel from './RegistrationSettingsPanel';
import './AdminUsersPage.css';

const ROLE_LABELS = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Admin' };
const ROLE_BADGES = { driver: 'badge-success', sponsor: 'badge-warning', admin: 'badge-neutral' };

function DirectorySkeleton() {
  return (
    <div className="card users-table-card" aria-label="Loading users">
      <div className="users-skeleton-heading" />
      {Array.from({ length: 5 }, (_, index) => (
        <div className="users-skeleton-row" key={index}>
          <Skeleton className="users-skeleton circle" />
          <Skeleton className="users-skeleton wide" />
          <Skeleton className="users-skeleton" />
          <Skeleton className="users-skeleton" />
        </div>
      ))}
    </div>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [organization, setOrganization] = useState('all');

  const loadUsers = useCallback(async () => {
    if (user?.account_type !== 'admin') return;
    setStatus('loading');
    try {
      setUsers(await api.getAdminUsers());
      setStatus('ready');
    } catch (error) {
      setStatus(error.status === 403 ? 'forbidden' : 'error');
    }
  }, [user]);

  useEffect(() => {
    document.title = 'Users | Good Driver Incentive Program';
    if (user?.account_type === 'admin') loadUsers();
  }, [loadUsers, user]);

  const counts = useMemo(() => users.reduce((result, current) => ({
    ...result,
    [current.role]: result[current.role] + 1,
  }), { all: users.length, driver: 0, sponsor: 0, admin: 0 }), [users]);

  const organizations = useMemo(() => Array.from(
    new Map(users
      .filter((current) => current.sponsor_org)
      .map((current) => [String(current.sponsor_org.id), current.sponsor_org])).values(),
  ).sort((left, right) => left.name.localeCompare(right.name)), [users]);
  const hasUnassignedDrivers = users.some((current) => current.role === 'driver' && !current.sponsor_org);
  const organizationOptions = useMemo(() => [
    { value: 'all', label: 'All organizations' },
    ...organizations.map((current) => ({ value: String(current.id), label: current.name })),
    ...(hasUnassignedDrivers ? [{ value: 'unassigned', label: 'Unassigned drivers' }] : []),
  ], [hasUnassignedDrivers, organizations]);

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((current) => (
      (role === 'all' || current.role === role)
      && (organization === 'all'
        || (organization === 'unassigned'
          ? current.role === 'driver' && !current.sponsor_org
          : String(current.sponsor_org?.id) === organization))
      && (!normalized
        || current.display_name.toLowerCase().includes(normalized)
        || current.username.toLowerCase().includes(normalized))
    ));
  }, [organization, query, role, users]);

  const clearFilters = () => {
    setQuery('');
    setRole('all');
    setOrganization('all');
  };

  if (user?.account_type !== 'admin' || status === 'forbidden') {
    return (
      <main className="users-page">
        <StatePanel headingLevel={1} title="You don't have access to this page">
          <p>Only administrators can view and manage user accounts.</p>
        </StatePanel>
      </main>
    );
  }

  return (
    <div className="users-page">
      <PageHeader
        title="Users"
        subtitle="Find and manage driver, sponsor, and admin accounts"
      />
      <main className="users-content" aria-busy={status === 'loading'}>
        <p className="sr-only" role="status" aria-live="polite">
          {status === 'loading' ? 'Loading users' : `${visibleUsers.length} users shown`}
        </p>
        <RegistrationSettingsPanel />
        {status === 'loading' && <DirectorySkeleton />}
        {status === 'error' && (
          <StatePanel tone="error" title="Users couldn't be loaded">
            <p>The server didn&apos;t send back the user list. Check your connection and try again.</p>
            <button className="button button-primary" type="button" onClick={loadUsers}>Try again</button>
          </StatePanel>
        )}
        {status === 'ready' && users.length === 0 && (
          <StatePanel icon={<span className="users-road" aria-hidden="true" />} title="No users yet">
            <p>Drivers, sponsors, and other administrators will appear here.</p>
            <Link className="button button-primary" to="/users/new">+ Add user</Link>
          </StatePanel>
        )}
        {status === 'ready' && users.length > 0 && (
          <section aria-labelledby="user-directory-heading">
            <h2 className="sr-only" id="user-directory-heading">User directory</h2>
            <div className="users-toolbar">
              <div className="users-search" role="search">
                <label className="sr-only" htmlFor="user-search">Search by name or username</label>
                <input id="user-search" type="search" placeholder="Search by name or username" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
                {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
              </div>
              <div className="users-filters" role="group" aria-label="Filter by role">
                {['all', 'driver', 'sponsor', 'admin'].map((option) => (
                  <button key={option} type="button" aria-pressed={role === option} onClick={() => setRole(option)}>
                    <span className="users-filter-content">
                      <span className="users-filter-label">{option === 'all' ? 'All' : `${ROLE_LABELS[option]}s`}</span>
                      <span className="users-filter-count">{counts[option]}</span>
                    </span>
                  </button>
                ))}
              </div>
              <SelectMenu
                className="users-organization-filter"
                label="Filter by sponsor organization"
                value={organization}
                options={organizationOptions}
                onChange={setOrganization}
              />
              <Link className="button button-primary users-toolbar-action" to="/users/new">
                <span className="users-add-icon" aria-hidden="true">+</span>
                <span>Add user</span>
              </Link>
            </div>
            <p className="users-count">{query || role !== 'all' || organization !== 'all' ? `Showing ${visibleUsers.length} of ${users.length} users` : `${users.length} users`}</p>
            {visibleUsers.length === 0 ? (
              <StatePanel className="users-state-compact" title="No users match">
                <p>Try another name or username, or clear the filters.</p>
                <button className="button" type="button" onClick={clearFilters}>Clear search and filters</button>
              </StatePanel>
            ) : (
              <div className="card users-table-card">
                <table>
                  <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Sponsor organization</th><th>Status</th></tr></thead>
                  <tbody>{visibleUsers.map((listedUser) => (
                    <tr key={listedUser.id}>
                      <td data-label="Name"><div className="users-person"><Avatar className={`users-avatar ${listedUser.role}`} name={listedUser.display_name} />{listedUser.role === 'sponsor' ? <Link className="users-name-link" to={`/users/sponsors/${listedUser.id}`}>{listedUser.display_name}</Link> : listedUser.role === 'driver' ? <Link className="users-name-link" to={`/users/drivers/${listedUser.id}`}>{listedUser.display_name}</Link> : listedUser.id !== user.id ? <Link className="users-name-link" to={`/users/admins/${listedUser.id}`}>{listedUser.display_name}</Link> : <strong>{listedUser.display_name} (you)</strong>}</div></td>
                      <td data-label="Username" className="users-username">@{listedUser.username}</td>
                      <td data-label="Role"><span className={`badge users-role ${ROLE_BADGES[listedUser.role]}`}>{ROLE_LABELS[listedUser.role]}</span></td>
                      <td data-label="Sponsor organization">{listedUser.sponsor_org?.name || (listedUser.role === 'driver' ? <i>Not assigned</i> : <span aria-label="Not applicable">—</span>)}</td>
                      <td data-label="Status"><span className={`users-status ${listedUser.is_active ? '' : 'inactive'}`}>{listedUser.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
