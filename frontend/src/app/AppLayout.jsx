import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import BrandMark from '../components/branding/BrandMark';
import ConfirmDialog from '../components/feedback/ConfirmDialog';
import { AccountIcon, ChevronDownIcon, SignOutIcon, UserIcon } from '../components/primitives/Icons';
import MfaSetupWall from '../features/accounts/MfaSetupWall';
import DeviceCheckDialog from '../features/authentication/DeviceCheckDialog';
import './AppLayout.css';
import { navItemsFor } from './navigation';
import { PageHeaderTargetProvider } from './PageHeader';

function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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

  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
      setConfirming(false);
    }
  };
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
            <button role="menuitem" type="button" onClick={() => setConfirming(true)}>
              <SignOutIcon size={18} />
              Sign out
            </button>
          </div>
        )}
        {confirming && (
          <ConfirmDialog
            title="Sign out?"
            message="Are you sure you want to sign out? You'll need to sign in again to keep using your account."
            confirmLabel={signingOut ? 'Signing out…' : 'Sign out'}
            busy={signingOut}
            onConfirm={confirmSignOut}
            onCancel={() => setConfirming(false)}
          />
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
  const { user, notice, signOut, stopImpersonation, answerDeviceCheck } = useAuth();
  const navigate = useNavigate();
  const [endingViewAs, setEndingViewAs] = useState(false);
  const [viewAsError, setViewAsError] = useState('');
  const [pageHeaderTarget, setPageHeaderTarget] = useState(null);
  const mfaWallNeeded = user
    && (user.account_type === 'sponsor' || user.account_type === 'admin')
    && user.mfa
    && user.mfa.required
    && !user.mfa.enrolled;

  // A timed-out session goes straight to sign-in, even from public pages.
  useEffect(() => {
    if (notice === 'expired' && !user) navigate('/login', { replace: true });
  }, [notice, user, navigate]);

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
          {navItemsFor(user).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <span className="nav-icon" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
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
        {user?.session?.device_check && (
          <DeviceCheckDialog
            onAnswer={answerDeviceCheck}
            onSignOut={signOut}
          />
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
