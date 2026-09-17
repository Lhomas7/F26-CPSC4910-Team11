import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { DriverList, DriverDetail } from './components/Drivers';
import AboutPage from './components/AboutPage';
import LoginPage from './components/LoginPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import './App.css';

function RequireAuth({ children }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function SiteLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="site-sidebar">
        <Link className="brand" to="/" aria-label="Good Driver home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Good Driver</span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink to="/" end>
            <span className="nav-icon" aria-hidden="true" />
            Drivers
          </NavLink>
          <NavLink to="/about">
            <span className="nav-icon" aria-hidden="true" />
            About
          </NavLink>
          {user ? (
            <>
              <span className="nav-user">{user.name || user.username}</span>
              <button className="nav-signout" type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/login">
              <span className="nav-icon" aria-hidden="true" />
              Sign in
            </NavLink>
          )}
        </nav>
      </aside>
      <div className="app-main" id="main-content" tabIndex="-1">
        <Outlet />
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SiteLayout />}>
        <Route path="/" element={<RequireAuth><DriverList /></RequireAuth>} />
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