import AdminHome from './AdminHome';
import DriverHome from './DriverHome';
import SponsorHome from './SponsorHome';

const DASHBOARDS = { driver: DriverHome, sponsor: SponsorHome, admin: AdminHome };

/** Select the role-specific dashboard without mixing their data or actions. */
export default function HomeDashboard({ accountType, user }) {
  const Dashboard = DASHBOARDS[accountType];
  return Dashboard ? <Dashboard user={user} /> : null;
}
