import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import * as api from 'api';
import { announceNotificationsChanged } from 'app/notificationEvents';
import useRefreshOnReturn from 'hooks/useRefreshOnReturn';

const CartContext = createContext(null);

/**
 * The driver's cart, shared by the cart button, the drawer, and catalog cards.
 * Mount it with a `key` for the effective identity so View-As or an account
 * switch never shows another driver's cart.
 */
export function CartProvider({ viewingAs = false, children }) {
  const [cart, setCart] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [lastPurchase, setLastPurchase] = useState(null);
  // Bumped after each purchase so pages showing the balance can reload.
  const [purchaseVersion, setPurchaseVersion] = useState(0);
  const latestRead = useRef(0);

  const reload = useCallback(async () => {
    const version = ++latestRead.current;
    setStatus('loading');
    try {
      const nextCart = await api.getCart();
      if (version !== latestRead.current) return;
      setCart(nextCart);
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (version !== latestRead.current) return;
      if ([401, 403, 409].includes(err.status)) setCart(null);
      setError(err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    reload();
    return () => { latestRead.current += 1; };
  }, [reload]);
  useRefreshOnReturn(() => { if (!checkingOut) reload(); });

  const clearActionError = useCallback(() => setActionError(''), []);
  const clearLastPurchase = useCallback(() => setLastPurchase(null), []);

  const checkout = useCallback(async () => {
    if (viewingAs) return;
    setCheckingOut(true);
    setActionError('');
    try {
      const { purchase, ...nextCart } = await api.checkout();
      latestRead.current += 1;
      setCart(nextCart);
      setError(null);
      setStatus('ready');
      setLastPurchase(purchase);
      setPurchaseVersion((version) => version + 1);
      announceNotificationsChanged();
    } catch (err) {
      setActionError(err.message || 'Checkout failed. Your points were not spent.');
      // Prices or availability may have changed; show the cart as it is now.
      reload();
    } finally {
      setCheckingOut(false);
    }
  }, [viewingAs, reload]);

  const change = useCallback(
    async (productId, action) => {
      if (viewingAs) return;
      setPendingIds((ids) => new Set(ids).add(productId));
      setActionError('');
      try {
        const nextCart = await action(productId);
        latestRead.current += 1;
        setCart(nextCart);
        setError(null);
        setStatus('ready');
      } catch (err) {
        setActionError(err.message || 'Your cart could not be updated. Try again.');
      } finally {
        setPendingIds((ids) => {
          const next = new Set(ids);
          next.delete(productId);
          return next;
        });
      }
    },
    [viewingAs],
  );

  const value = useMemo(() => {
    const productIds = new Set(cart?.results.map((item) => item.product.id) ?? []);
    return {
      cart,
      status,
      error,
      actionError,
      clearActionError,
      checkout,
      checkingOut,
      lastPurchase,
      clearLastPurchase,
      purchaseVersion,
      // Null until loaded so callers can fall back to the catalog's in_cart.
      productIds: cart ? productIds : null,
      itemCount: cart?.item_count ?? 0,
      pendingIds,
      viewingAs,
      open,
      setOpen,
      reload,
      add: (productId) => change(productId, api.addToCart),
      remove: (productId) => change(productId, api.removeFromCart),
    };
  }, [
    cart,
    status,
    error,
    actionError,
    clearActionError,
    checkout,
    checkingOut,
    lastPurchase,
    clearLastPurchase,
    purchaseVersion,
    pendingIds,
    viewingAs,
    open,
    reload,
    change,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** The cart, or null outside a driver's CartProvider. */
export function useCart() {
  return useContext(CartContext);
}
