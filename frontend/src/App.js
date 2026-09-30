import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { DriverList, DriverDetail } from './components/Drivers';
import AboutPage from './components/AboutPage';
import LoginPage from './components/LoginPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import MfaSetupWall from './components/MfaSetupWall';
import WelcomePage from './components/WelcomePage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AccountPage from './components/AccountPage';
import AdminUsersPage from './components/AdminUsersPage';
import AddUserPage from './components/AddUserPage';
import SponsorDetailPage from './components/SponsorDetailPage';
import DriverDetailPage from './components/DriverDetailPage';
import AdminDetailPage from './components/AdminDetailPage';
import './App.css';

function RequireAuth({ children }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

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

function SiteLayout() {
  const { user, signOut } = useAuth();
  const sponsorNeedsMfa = user && user.account_type === 'sponsor' && user.mfa && !user.mfa.enrolled;

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
        <header className="app-topbar">
          <AccountMenu user={user} onSignOut={signOut} />
        </header>
        <div className="app-content" id="main-content" tabIndex="-1">
          {sponsorNeedsMfa ? (
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
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
      <Route element={<SiteLayout />}>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/drivers" element={<RequireAuth><DriverList /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><AdminUsersPage /></RequireAuth>} />
        <Route path="/users/new" element={<RequireAuth><AddUserPage /></RequireAuth>} />
        <Route path="/users/sponsors/:userId" element={<RequireAuth><SponsorDetailPage /></RequireAuth>} />
        <Route path="/users/drivers/:userId" element={<RequireAuth><DriverDetailPage /></RequireAuth>} />
        <Route path="/users/admins/:userId" element={<RequireAuth><AdminDetailPage /></RequireAuth>} />
        <Route path="/drivers/:driverId" element={<RequireAuth><DriverDetail /></RequireAuth>} />
        <Route path="/about" element={<AboutPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
