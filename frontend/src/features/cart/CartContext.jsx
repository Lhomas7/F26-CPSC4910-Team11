import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import * as api from 'api';
import { announceNotificationsChanged } from 'app/notificationEvents';
import useRefreshOnReturn from 'hooks/useRefreshOnReturn';
import { loadAttempt, newAttemptKey, removeAttempt, saveAttempt } from './pendingAttempt';

const CartContext = createContext(null);

/** One effective Driver's cart and recoverable purchase attempt. */
export function CartProvider({ viewingAs = false, ownerId = null, organization = '', children }) {
  const [cart, setCart] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutPhase, setCheckoutPhase] = useState('idle');
  const [lastPurchase, setLastPurchase] = useState(null);
  const [purchaseVersion, setPurchaseVersion] = useState(0);
  const [review, setReview] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('idle');
  const [reviewNotice, setReviewNotice] = useState('');
  const [pendingAttempt, setPendingAttempt] = useState(() => viewingAs ? null : loadAttempt(ownerId));
  const [, refreshRetryState] = useState(0);
  const attempt = useRef(pendingAttempt);
  const originalReview = useRef(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const latestRead = useRef(0);
  const reviewVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++latestRead.current;
    setStatus('loading');
    try {
      const data = await api.getCart();
      if (!alive.current || version !== latestRead.current) return;
      setCart(data); setError(null); setStatus('ready');
    } catch (failure) {
      if (!alive.current || version !== latestRead.current) return;
      if ([401, 403, 409].includes(failure.status)) setCart(null);
      setError(failure); setStatus('error');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; latestRead.current += 1; reviewVersion.current += 1; };
  }, [reload]);
  useRefreshOnReturn(() => { if (!busy.current) reload(); });
  useEffect(() => {
    if (!pendingAttempt || !originalReview.current) return undefined;
    const remaining = Math.max(0, originalReview.current.receivedAt + 600000 - Date.now());
    const timer = setTimeout(() => {
      originalReview.current = null;
      refreshRetryState((version) => version + 1);
    }, remaining);
    return () => clearTimeout(timer);
  }, [pendingAttempt]);

  const clearActionError = useCallback(() => setActionError(''), []);
  const clearLastPurchase = useCallback(() => setLastPurchase(null), []);
  const clearReview = () => {
    reviewVersion.current += 1;
    setReview(null); setReviewStatus('idle'); setReviewNotice('');
    originalReview.current = null;
  };

  async function beginReview() {
    if (viewingAs || attempt.current || busy.current || pendingIds.size) return;
    const version = ++reviewVersion.current;
    setReview(null); setReviewStatus('loading'); setReviewNotice(''); setActionError('');
    try {
      const fresh = await api.reviewCart();
      if (!alive.current || version !== reviewVersion.current) return;
      originalReview.current = { token: fresh.review_token, receivedAt: Date.now() };
      setReview(fresh); setReviewStatus('ready');
    } catch (failure) {
      if (!alive.current || version !== reviewVersion.current) return;
      setActionError(failure.message || 'Review could not be loaded. No points were spent.');
      setReviewStatus([401, 403].includes(failure.status) ? 'denied' : 'error');
    }
  }

  function resolved(receipt) {
    removeAttempt(ownerId);
    attempt.current = null; setPendingAttempt(null); originalReview.current = null;
    setLastPurchase(receipt); setReview(null); setReviewStatus('idle'); setActionError('');
    setPurchaseVersion((version) => version + 1);
    announceNotificationsChanged();
  }

  async function checkout() {
    if (viewingAs || busy.current || pendingIds.size) return;
    const retry = Boolean(attempt.current);
    if (!originalReview.current || (!retry && !review)) return;
    if (retry && (Date.now() - originalReview.current.receivedAt >= 600000 ||
        attempt.current.organization !== organization)) return;
    let current;
    try {
      current = attempt.current || { key: newAttemptKey(), startedAt: new Date().toISOString(), organization };
      saveAttempt(ownerId, current);
    } catch {
      setActionError('Recovery information could not be saved. Purchase was not submitted.');
      return;
    }
    busy.current = true; attempt.current = current; setPendingAttempt(current);
    setCheckingOut(true); setCheckoutPhase(retry ? 'retrying' : 'submitting'); setActionError('');
    try {
      const { purchase, ...nextCart } = await api.checkout({
        idempotency_key: current.key, review_token: originalReview.current.token,
      });
      if (!alive.current) return;
      latestRead.current += 1;
      setCart(nextCart); setError(null); setStatus('ready'); resolved(purchase);
    } catch (failure) {
      if (!alive.current) return;
      if (!retry && [400, 401, 403, 409].includes(failure.status)) {
        removeAttempt(ownerId); attempt.current = null; setPendingAttempt(null);
        if (failure.status === 409 && failure.data?.code === 'review_changed') {
          try {
            const fresh = api.readCartReview(failure.data.review);
            originalReview.current = { token: fresh.review_token, receivedAt: Date.now() };
            setReview(fresh); setReviewStatus('ready');
            setReviewNotice('Your cart or pricing changed. Nothing was purchased. Review these current values before confirming.');
          } catch {
            clearReview(); setActionError('Purchase was refused. Please load a new review.');
          }
        } else {
          clearReview(); setActionError(failure.message || 'Purchase was refused.'); reload();
        }
      } else {
        setActionError('This purchase has not been confirmed. Check its status before starting another purchase.');
        if (failure.status === 409) originalReview.current = null;
      }
    } finally {
      busy.current = false;
      if (alive.current) setCheckingOut(false);
    }
  }

  async function checkPurchaseStatus() {
    if (!attempt.current || busy.current || viewingAs) return;
    busy.current = true; setCheckingOut(true); setCheckoutPhase('lookup'); setActionError('');
    try {
      const receipt = await api.lookupRedemption(attempt.current.key);
      if (!alive.current) return;
      resolved(receipt); reload();
    } catch (failure) {
      if (alive.current) setActionError(failure.status === 404
        ? 'No completed purchase was found for this attempt yet. It may still be processing.'
        : 'Purchase status could not be checked. The outcome remains unknown.');
    } finally {
      busy.current = false;
      if (alive.current) setCheckingOut(false);
    }
  }

  async function change(productId, action) {
    if (viewingAs || attempt.current || busy.current || pendingIds.has(productId)) return;
    setPendingIds((ids) => new Set(ids).add(productId)); setActionError(''); clearReview();
    try {
      const data = await action(productId);
      if (!alive.current) return;
      latestRead.current += 1; setCart(data); setError(null); setStatus('ready');
    } catch (failure) {
      if (alive.current) setActionError(failure.message || 'Your cart could not be updated.');
    } finally {
      if (alive.current) setPendingIds((ids) => { const next = new Set(ids); next.delete(productId); return next; });
    }
  }

  return <CartContext.Provider value={{
    cart, status, error, actionError, clearActionError, checkout, checkingOut, checkoutPhase,
    lastPurchase, clearLastPurchase, purchaseVersion, pendingIds, viewingAs,
    open, setOpen, reload, review, reviewStatus, reviewNotice, beginReview, clearReview,
    pendingAttempt, checkPurchaseStatus,
    canRetry: Boolean(pendingAttempt && originalReview.current &&
      Date.now() - originalReview.current.receivedAt < 600000 && pendingAttempt.organization === organization),
    productIds: cart ? new Set(cart.results.map((item) => item.product.id)) : null,
    itemCount: cart?.item_count ?? 0,
    add: (id) => change(id, api.addToCart), remove: (id) => change(id, api.removeFromCart),
  }}>{children}</CartContext.Provider>;
}

export function useCart() { return useContext(CartContext); }
