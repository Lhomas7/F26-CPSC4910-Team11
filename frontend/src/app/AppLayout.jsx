import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import BrandMark from '../components/BrandMark';
import { AccountIcon, ChevronDownIcon, SignOutIcon, UserIcon } from '../components/Icons';
import MfaSetupWall from '../features/accounts/MfaSetupWall';
import './AppLayout.css';
import { PageHeaderTargetProvider } from './PageHeader';

function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const closeTimerRef = useRef(null);
  const openedByHoverRef = useRef(false);

  const keepMenuOpen = () => {
    window.clearTimeout(closeTimerRef.current);
    if (!open) openedByHoverRef.current = true;
    setOpen(true);
  };

  const scheduleMenuClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      openedByHoverRef.current = false;
      setOpen(false);
    }, 220);
  };

  const toggleMenu = () => {
    window.clearTimeout(closeTimerRef.current);
    if (openedByHoverRef.current) {
      openedByHoverRef.current = false;
      setOpen(true);
      return;
    }
    setOpen((current) => !current);
  };

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        openedByHoverRef.current = false;
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        openedByHoverRef.current = false;
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.clearTimeout(closeTimerRef.current);
    };
  }, [open]);

  if (user) {
    const displayName = user.name || user.username;
    return (
      <div
        className="profile-menu-shell"
        ref={menuRef}
        onMouseEnter={keepMenuOpen}
        onMouseLeave={scheduleMenuClose}
      >
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Profile menu for ${displayName}`}
          className="profile-menu-trigger"
          type="button"
          onClick={toggleMenu}
        >
          <UserIcon size={21} />
          <span className="profile-trigger-name">{displayName}</span>
          <ChevronDownIcon className="profile-menu-chevron" size={14} />
        </button>
        {open && (
          <div className="profile-menu" role="menu">
            <div className="profile-menu-identity">
              <strong>{displayName}</strong>
              <span>@{user.username}</span>
            </div>
            <div className="profile-menu-divider" />
            <Link role="menuitem" to="/account" onClick={() => setOpen(false)}>
              <AccountIcon size={18} />
              Account
            </Link>
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onSignOut(); }}>
              <SignOutIcon size={18} />
              Sign out
            </button>
          </div>
        )}
      </div>
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
          <BrandMark />
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
          {user?.account_type === 'admin' && (
            <NavLink to="/users">
              <span className="nav-icon" aria-hidden="true" />
              Users
            </NavLink>
          )}
        </nav>
        <div className="sidebar-account">
          <AccountMenu user={user} onSignOut={signOut} />
        </div>
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
