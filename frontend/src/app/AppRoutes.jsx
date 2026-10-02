import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import AboutPage from '../features/about/AboutPage';
import AccountPage from '../features/accounts/AccountPage';
import AddUserPage from '../features/admin-users/AddUserPage';
import AdminDetailPage from '../features/admin-users/AdminDetailPage';
import AdminUsersPage from '../features/admin-users/AdminUsersPage';
import DriverDetailPage from '../features/admin-users/DriverDetailPage';
import SponsorDetailPage from '../features/admin-users/SponsorDetailPage';
import ForgotPasswordPage from '../features/authentication/ForgotPasswordPage';
import LoginPage from '../features/authentication/LoginPage';
import ResetPasswordPage from '../features/authentication/ResetPasswordPage';
import { PrivacyPage, TermsPage } from '../features/legal/LegalPage';
import { DriverDetail, DriverList } from '../features/drivers/Drivers';
import WelcomePage from '../features/home/WelcomePage';
import { AppLayout } from './AppLayout';

function RequireAuth({ children }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
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
      <Route element={<AppLayout />}>
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
