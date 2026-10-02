import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import * as api from '../../api';
import PageHeader from '../../app/PageHeader';
import './AdminUsersPage.css';

const ROLE_LABELS = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Admin' };

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join('') || '?';
}

function DirectorySkeleton() {
  return (
    <div className="users-table-card" aria-label="Loading users">
      <div className="users-skeleton-heading" />
      {Array.from({ length: 5 }, (_, index) => (
        <div className="users-skeleton-row" key={index}>
          <span className="users-skeleton circle" />
          <span className="users-skeleton wide" />
          <span className="users-skeleton" />
          <span className="users-skeleton" />
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

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((current) => (
      (role === 'all' || current.role === role)
      && (!normalized
        || current.display_name.toLowerCase().includes(normalized)
        || current.username.toLowerCase().includes(normalized))
    ));
  }, [query, role, users]);

  const clearFilters = () => {
    setQuery('');
    setRole('all');
  };

  if (user?.account_type !== 'admin' || status === 'forbidden') {
    return (
      <main className="users-page">
        <section className="users-state">
          <h1>You don&apos;t have access to this page</h1>
          <p>Only administrators can view and manage user accounts.</p>
        </section>
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
        {status === 'loading' && <DirectorySkeleton />}
        {status === 'error' && (
          <section className="users-state error" role="alert">
            <h2>Users couldn&apos;t be loaded</h2>
            <p>The server didn&apos;t send back the user list. Check your connection and try again.</p>
            <button className="users-button primary" type="button" onClick={loadUsers}>Try again</button>
          </section>
        )}
        {status === 'ready' && users.length === 0 && (
          <section className="users-state">
            <span className="users-road" aria-hidden="true" />
            <h2>No users yet</h2>
            <p>Drivers, sponsors, and other administrators will appear here.</p>
            <Link className="users-button primary" to="/users/new">+ Add user</Link>
          </section>
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
                    {option === 'all' ? 'All' : `${ROLE_LABELS[option]}s`} <span>{counts[option]}</span>
                  </button>
                ))}
              </div>
              <Link className="users-button primary users-toolbar-action" to="/users/new">+ Add user</Link>
            </div>
            <p className="users-count">{query || role !== 'all' ? `Showing ${visibleUsers.length} of ${users.length} users` : `${users.length} users`}</p>
            {visibleUsers.length === 0 ? (
              <section className="users-state compact">
                <h2>No users match</h2>
                <p>Try another name or username, or clear the filters.</p>
                <button className="users-button" type="button" onClick={clearFilters}>Clear search and filters</button>
              </section>
            ) : (
              <div className="users-table-card">
                <table>
                  <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Sponsor organization</th><th>Status</th></tr></thead>
                  <tbody>{visibleUsers.map((listedUser) => (
                    <tr key={listedUser.id}>
                      <td data-label="Name"><div className="users-person"><span className={`users-avatar ${listedUser.role}`} aria-hidden="true">{initials(listedUser.display_name)}</span>{listedUser.role === 'sponsor' ? <Link className="users-name-link" to={`/users/sponsors/${listedUser.id}`}>{listedUser.display_name}</Link> : listedUser.role === 'driver' ? <Link className="users-name-link" to={`/users/drivers/${listedUser.id}`}>{listedUser.display_name}</Link> : listedUser.id !== user.id ? <Link className="users-name-link" to={`/users/admins/${listedUser.id}`}>{listedUser.display_name}</Link> : <strong>{listedUser.display_name} (you)</strong>}</div></td>
                      <td data-label="Username" className="users-username">@{listedUser.username}</td>
                      <td data-label="Role"><span className={`users-role ${listedUser.role}`}>{ROLE_LABELS[listedUser.role]}</span></td>
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
