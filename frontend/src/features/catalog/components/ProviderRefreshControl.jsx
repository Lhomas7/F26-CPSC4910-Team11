import { useRef, useState } from 'react';

import { refreshProviderProduct } from '../../../api/catalog';

export default function ProviderRefreshControl({ product, onRefresh }) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await refreshProviderProduct(product.id);
      onRefresh();
    } catch (failure) {
      setError(failure.message || 'Product refresh failed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return <div className="catalog-provider-refresh">
    <button className="button" type="button" disabled={busy} onClick={refresh}>
      {busy ? 'Updating…' : `Update price and details for ${product.name}`}
    </button>
    {error && <small role="alert">{error}</small>}
  </div>;
}
