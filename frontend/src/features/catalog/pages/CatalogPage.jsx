import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import StatePanel from '../../../components/feedback/StatePanel';
import SponsorCatalogPage from './SponsorCatalogPage';
import { catalogIdentity } from '../utils/identity';

export default function CatalogPage() {
  const { user } = useAuth();
  if (user?.account_type === 'sponsor') {
    // Remount synchronously on identity/organization/View-As changes. A hook
    // cleanup alone would leave the previous account's cards visible for a render.
    const identity = catalogIdentity(user);
    return <SponsorCatalogPage key={identity} identity={identity} />;
  }

  // Driver UI remains separate until its own mockup/integration group.
  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle="Your sponsor’s reward catalog"
      />
      <StatePanel title="Catalog is not available yet">
        <p>
          Reward browsing is being prepared. Products and point costs are not available here yet.
        </p>
      </StatePanel>
    </>
  );
}
