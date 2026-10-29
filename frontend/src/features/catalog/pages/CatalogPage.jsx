import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import StatePanel from '../../../components/feedback/StatePanel';
import SponsorCatalogPage from './SponsorCatalogPage';
import DriverCatalogPage from './DriverCatalogPage';
import { catalogIdentity } from '../utils/identity';

export default function CatalogPage() {
  const { user } = useAuth();
  if (user?.account_type === 'sponsor') {
    // Remount synchronously on identity/organization/View-As changes. A hook
    // cleanup alone would leave the previous account's cards visible for a render.
    const identity = catalogIdentity(user);
    return <SponsorCatalogPage key={identity} identity={identity} />;
  }

  if (user?.account_type === 'driver') {
    return <DriverCatalogPage key={catalogIdentity(user)} />;
  }

  // Route authorization normally handles this; never load catalog data for an
  // unexpected role if this feature is rendered on its own.
  return (
    <>
      <PageHeader title="Catalog" subtitle="Your sponsor’s reward catalog" />
      <StatePanel title="Catalog access is unavailable">
        <p>Only Driver and Sponsor accounts can browse a reward catalog.</p>
      </StatePanel>
    </>
  );
}
