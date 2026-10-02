import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import MfaSetupWall from '../features/accounts/MfaSetupWall';
import './AppLayout.css';
import { PageHeaderTargetProvider } from './PageHeader';

function AccountMenu({ user, onSignOut }) {
  if (user) {
    return (
      <>
        <span className="topbar-user">{user.name || user.username}</span>
        <button className="topbar-signout" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </>
    );
  }

  return (
    <Link className="topbar-signin" to="/login">
      Sign in
    </Link>
  );
}

export function AppLayout() {
  const { user, signOut, stopImpersonation } = useAuth();
  const [endingViewAs, setEndingViewAs] = useState(false);
  const [viewAsError, setViewAsError] = useState('');
  const [pageHeaderTarget, setPageHeaderTarget] = useState(null);
  const mfaWallNeeded = user
    && (user.account_type === 'sponsor' || user.account_type === 'admin')
    && user.mfa
    && user.mfa.required
    && !user.mfa.enrolled;

  const stopViewingAs = async () => {
    setEndingViewAs(true);
    setViewAsError('');
    try {
      await stopImpersonation();
    } catch (error) {
      setViewAsError(error.message || 'Could not return to your admin account.');
    } finally {
      setEndingViewAs(false);
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="site-sidebar">
        <Link className="brand" to="/" aria-label="Good Driver home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Good Driver</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink to="/drivers">
            <span className="nav-icon" aria-hidden="true" />
            Drivers
          </NavLink>
          <NavLink to="/about">
            <span className="nav-icon" aria-hidden="true" />
            About
          </NavLink>
          <NavLink to="/account">
            <span className="nav-icon" aria-hidden="true" />
            Account
          </NavLink>
          {user?.account_type === 'admin' && (
            <NavLink to="/users">
              <span className="nav-icon" aria-hidden="true" />
              Users
            </NavLink>
          )}
        </nav>
      </aside>
      <div className="app-main">
        {user?.impersonation?.active && (
          <div className="impersonation-banner" role="status">
            <span>
              <strong>Viewing as {user.name || user.username}</strong>
              {' '}({user.account_type}). You are still signed in as {user.impersonation.admin.name}.
            </span>
            {viewAsError && <span className="impersonation-error">{viewAsError}</span>}
            <button type="button" onClick={stopViewingAs} disabled={endingViewAs}>
              {endingViewAs ? 'Returning…' : 'Return to admin account'}
            </button>
          </div>
        )}
        <header className="app-topbar">
          <div className="app-topbar-page" ref={setPageHeaderTarget} />
          <div className="app-topbar-account">
            <AccountMenu user={user} onSignOut={signOut} />
          </div>
        </header>
        <div className="app-content" id="main-content" tabIndex="-1">
          <PageHeaderTargetProvider target={pageHeaderTarget}>
            {mfaWallNeeded ? (
              <MfaSetupWall />
            ) : (
              <>
                {user && user.mfa && user.mfa.required && !user.mfa.enrolled && (
                  <div className="mfa-required-banner">
                    Your sponsor requires two-factor authentication. Set it up to keep
                    signing in without interruption.{' '}
                    <Link to="/account">Set up now</Link>
                  </div>
                )}
                <Outlet />
              </>
            )}
          </PageHeaderTargetProvider>
        </div>
      </div>
    </div>
  );
}
