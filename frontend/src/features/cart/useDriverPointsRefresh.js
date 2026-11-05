import { useEffect, useRef } from 'react';

import useRefreshOnReturn from '../../hooks/useRefreshOnReturn';
import { useCart } from './CartContext';

/** Refresh point-dependent requests after checkout and when returning to the tab. */
export default function useDriverPointsRefresh(...reloads) {
  const purchaseVersion = useCart()?.purchaseVersion ?? 0;
  const seen = useRef(purchaseVersion);
  const callbacks = useRef(reloads);
  callbacks.current = reloads;
  useEffect(() => {
    if (purchaseVersion === seen.current) return;
    seen.current = purchaseVersion;
    callbacks.current.forEach((reload) => reload());
  }, [purchaseVersion]);
  useRefreshOnReturn(() => callbacks.current.forEach((reload) => reload()));
}
