import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import StatePanel from '../../../components/feedback/StatePanel';

export default function CatalogPage() {
  const { user } = useAuth();
  const isSponsor = user?.account_type === 'sponsor';

  // This unlinked route establishes the shell only. Do not request a nonexistent
  // API or present an empty catalog as though data has successfully loaded.
  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle={isSponsor ? 'Your organization’s reward catalog' : 'Your sponsor’s reward catalog'}
      />
      <StatePanel title="Catalog is not available yet">
        <p>
          {isSponsor
            ? 'Product management is being prepared. You cannot add or change products here yet.'
            : 'Reward browsing is being prepared. Products and point costs are not available here yet.'}
        </p>
      </StatePanel>
    </>
  );
}
