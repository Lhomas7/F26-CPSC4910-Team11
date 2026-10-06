import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import StatePanel from '../components/feedback/StatePanel';
import AboutPage from '../features/about/AboutPage';
import AccountPage from '../features/accounts/AccountPage';
import AddUserPage from '../features/admin-users/AddUserPage';
import AdminDetailPage from '../features/admin-users/AdminDetailPage';
import AdminUsersPage from '../features/admin-users/AdminUsersPage';
import AdminDriverDetailPage from '../features/admin-users/DriverDetailPage';
import SponsorDetailPage from '../features/admin-users/SponsorDetailPage';
import ForgotPasswordPage from '../features/authentication/ForgotPasswordPage';
import LoginPage from '../features/authentication/LoginPage';
import ResetPasswordPage from '../features/authentication/ResetPasswordPage';
import { PrivacyPage, TermsPage } from '../features/legal/LegalPage';
import { DriverDetailPage, DriverListPage } from '../features/drivers';
import WelcomePage from '../features/home/WelcomePage';
import PlaygroundPage from '../features/playground/PlaygroundPage';
import PointsPage from '../features/points/PointsPage';
import { AppLayout } from './AppLayout';
import { PAGE_ROLES } from './navigation';

// Signed-in pages. `roles` limits a page to some account types; everyone else
// gets a 403 panel instead of a page that would only fail to load.
function RequireAuth({ roles, children }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.account_type)) {
    return (
      <main className="forbidden-page">
        <StatePanel headingLevel={1} title="You don't have access to this page">
          <p>This page isn&apos;t available for your account type.</p>
        </StatePanel>
      </main>
    );
  }
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {/* Unlinked sandbox for the drawn assets in components/assets. */}
      <Route path="/playground" element={<PlaygroundPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/points" element={<RequireAuth roles={PAGE_ROLES.points}><PointsPage /></RequireAuth>} />
        <Route path="/drivers" element={<RequireAuth roles={PAGE_ROLES.drivers}><DriverListPage /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/users" element={<RequireAuth roles={PAGE_ROLES.users}><AdminUsersPage /></RequireAuth>} />
        <Route path="/users/new" element={<RequireAuth roles={PAGE_ROLES.users}><AddUserPage /></RequireAuth>} />
        <Route path="/users/sponsors/:userId" element={<RequireAuth roles={PAGE_ROLES.users}><SponsorDetailPage /></RequireAuth>} />
        <Route path="/users/drivers/:userId" element={<RequireAuth roles={PAGE_ROLES.users}><AdminDriverDetailPage /></RequireAuth>} />
        <Route path="/users/admins/:userId" element={<RequireAuth roles={PAGE_ROLES.users}><AdminDetailPage /></RequireAuth>} />
        <Route path="/drivers/:driverId" element={<RequireAuth roles={PAGE_ROLES.drivers}><DriverDetailPage /></RequireAuth>} />
        <Route path="/about" element={<AboutPage />} />
      </Route>
    </Routes>
  );
}
