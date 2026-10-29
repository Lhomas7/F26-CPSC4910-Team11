import { Link } from 'react-router-dom';
import StatePanel from '../../../components/feedback/StatePanel';

export default function CatalogAccessPanel({ error }) {
  const code = error?.data?.code;
  const pending = code === 'driver_not_approved';
  const unassigned = code === 'sponsor_required';
  return (
    <StatePanel
      tone="error"
      title={
        pending
          ? 'Your approval is pending'
          : unassigned
            ? 'No sponsor linked'
            : 'Catalog access is unavailable'
      }
    >
      <p>
        {pending
          ? 'Your sponsor must approve your Driver account before you can browse its reward catalog.'
          : unassigned
            ? 'You need to be linked to a sponsor before you can browse a reward catalog.'
            : error?.message || 'Your session or catalog access has changed.'}
      </p>
      <Link className="button" to="/">
        Return home
      </Link>
    </StatePanel>
  );
}
