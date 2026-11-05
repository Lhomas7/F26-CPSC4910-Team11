import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import Modal from 'components/feedback/Modal';
import ProductImage from 'features/catalog/components/ProductImage';
import { useCart } from './CartContext';
import './CartDrawer.css';
import './CartViews.css';

const numbers = new Intl.NumberFormat('en-US');
const localTime = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
});
const validPoints = (value) => Number.isSafeInteger(value) && value >= 0;
const points = (value) => validPoints(value) ? `${numbers.format(value)} ${value === 1 ? 'point' : 'points'}` : 'Unavailable';

function Lines({ rows }) {
  return <ul className="cart-lines">{rows.map((row, index) =>
    <li className="cart-line" key={`${row.name}-${index}`}>
      <span className="cart-line-name">{row.name}</span>
      <span className="cart-line-cost">{points(row.unit_points)}</span>
    </li>)}</ul>;
}

function Totals({ total, balance, receipt = false }) {
  const short = validPoints(balance) && validPoints(total) && total > balance;
  return <dl className="cart-totals">
    <div className="cart-total-main"><dt>{receipt ? 'Points spent' : 'Total'}</dt><dd>{points(total)}</dd></div>
    <div><dt>{receipt ? 'Balance after this purchase' : 'Current balance'}</dt><dd>{points(balance)}</dd></div>
    {!receipt && validPoints(total) && validPoints(balance) && <div>
      <dt>{short ? 'Short by' : 'Expected balance after purchase'}</dt>
      <dd>{points(short ? total - balance : balance - total)}</dd>
    </div>}
  </dl>;
}

function blockers(cart, viewingAs, changing) {
  if (viewingAs) return 'You’re viewing as this driver, so the cart is read-only.';
  if (changing) return 'Wait for the cart update to finish.';
  if (!cart?.results.length) return 'Your cart is empty.';
  if (!validPoints(cart.total_points) || !validPoints(cart.point_balance) ||
      cart.results.some((item) => !validPoints(item.product.point_cost))) return 'A point cost is unavailable. Refresh before buying.';
  const reasons = [];
  if (cart.total_points > cart.point_balance) reasons.push(`You need ${points(cart.total_points - cart.point_balance)} more`);
  if (cart.results.some((item) => !item.product.is_available)) reasons.push('Remove unavailable rewards before buying');
  return reasons.join('. ');
}

export default function CartDrawer({ onClose }) {
  const state = useCart();
  const { cart, review, reviewStatus, reviewNotice, status, error, actionError, pendingAttempt,
    checkingOut, checkoutPhase, lastPurchase, viewingAs, pendingIds, reload, beginReview,
    clearReview, checkout, checkPurchaseStatus, canRetry, clearLastPurchase, remove } = state;
  const heading = useRef(null);
  useEffect(() => { reload(); }, [reload]);
  const reviewing = reviewStatus !== 'idle';
  const pending = pendingAttempt && !(checkingOut && checkoutPhase === 'submitting');
  const title = pending ? 'Purchase not confirmed' : lastPurchase ? 'Purchase complete' : reviewing ? 'Review your purchase' : `Your cart (${cart?.item_count ?? 0})`;
  useEffect(() => { heading.current?.focus(); }, [title]);
  let body;

  if (pending) {
    body = <div className="cart-view">
      <div className="cart-pending-panel" role="alert">
        <h3>This purchase hasn’t been confirmed</h3>
        <p>We can’t tell whether this purchase went through. Your points may or may not have been spent.</p>
        <p>Check your point balance on Points or Home before buying anything else.</p>
        <span className="cart-pending-meta">Started {localTime.format(new Date(pendingAttempt.startedAt))}{pendingAttempt.organization ? ` · ${pendingAttempt.organization}` : ''}</span>
      </div>
      <div className="cart-actions-row">
        {canRetry && <button className="button button-primary" disabled={checkingOut} onClick={checkout}>
          {checkingOut && checkoutPhase === 'retrying' ? 'Retrying…' : 'Retry purchase'}
        </button>}
        <button className="button" disabled={checkingOut || viewingAs} onClick={checkPurchaseStatus}>
          {checkingOut && checkoutPhase === 'lookup' ? 'Checking…' : 'Check purchase status'}
        </button>
      </div>
      <p className="cart-blocked-reason">{canRetry
        ? 'Retry purchase may finish the original purchase using the same request. Check purchase status only reads its result.'
        : 'The original review is no longer available. Checking status buys nothing and does not cancel the attempt.'}</p>
      <p className="cart-view-lead">Until this is settled you can’t change your cart or start another purchase.</p>
    </div>;
  } else if (lastPurchase) {
    body = <div className="cart-view">
      <p className="banner banner-success" role="status">{lastPurchase.points_spent === 0 ? 'Purchase complete. No points were deducted.' : 'Purchase complete.'}</p>
      {lastPurchase.replayed && <p className="banner">This purchase was already completed. These are the original purchase details.</p>}
      <h3 className="cart-view-heading">What you bought</h3>
      <Lines rows={lastPurchase.line_items} />
      <Totals receipt total={lastPurchase.points_spent} balance={lastPurchase.point_balance} />
      <p className="cart-view-lead">Completed <time dateTime={lastPurchase.completed_at}>{localTime.format(new Date(lastPurchase.completed_at))}</time></p>
      <div><span className="cart-reference-label">Reference</span><code className="cart-reference" tabIndex={0}>{lastPurchase.reference}</code></div>
      <button className="button button-primary" onClick={() => { clearLastPurchase(); clearReview(); onClose(); }}>Keep shopping</button>
      {lastPurchase.points_spent > 0 && <Link to="/points" onClick={onClose}>See point history</Link>}
    </div>;
  } else if (reviewing) {
    const blocked = blockers(review, viewingAs, pendingIds.size);
    body = <div className="cart-view">
      {reviewStatus === 'loading' ? <p role="status">Checking current prices and availability…</p> : review ? <>
        {reviewNotice && <p className="banner banner-warning" role="alert">{reviewNotice}</p>}
        <p className="cart-view-lead">Confirming spends the points below and empties your cart.</p>
        <Lines rows={review.results.map(({ product }) => ({ name: product.name, unit_points: product.point_cost }))} />
        <Totals total={review.total_points} balance={review.point_balance} />
      </> : <p>No points were spent. {reviewStatus === 'denied' ? 'Sign in with an eligible Driver account to continue.' : 'The review could not be loaded.'}</p>}
      <div className="cart-actions-row">
        {review && <button className="button button-primary" disabled={Boolean(blocked) || checkingOut} onClick={checkout}>{checkingOut ? 'Purchasing…' : 'Confirm purchase'}</button>}
        {reviewStatus === 'error' && <button className="button button-primary" onClick={beginReview}>Try again</button>}
        <button className="button" data-autofocus disabled={checkingOut} onClick={clearReview}>Back to cart</button>
      </div>
      {review && blocked && <p className="cart-blocked-reason">{blocked}</p>}
    </div>;
  } else if (!cart) {
    body = status === 'loading' ? <p role="status">Loading your cart…</p> : <div className="cart-drawer-state">
      <p>{error?.data?.code === 'driver_not_approved' ? 'Your sponsor must approve your Driver account before you can use a cart.' : error?.data?.code === 'sponsor_required' ? 'You need to be linked to a sponsor before you can use a cart.' : error?.message || 'Your cart couldn’t be loaded.'}</p>
      {![401, 403].includes(error?.status) && <button className="button" onClick={reload}>Try again</button>}
    </div>;
  } else if (!cart.results.length) {
    body = <div className="cart-drawer-state"><p>Your cart is empty.</p><p>Use Add to cart on a reward in the catalog to save it here.</p></div>;
  } else {
    const blocked = blockers(cart, viewingAs, pendingIds.size);
    body = <div className="cart-view">
      <ul className="cart-items" aria-label="Rewards in your cart">{cart.results.map(({ product }) => <li className="cart-item" key={product.id}>
        <div className="cart-item-image"><ProductImage src={product.image_url} name={product.name} emptyText="" failedText="" /></div>
        <div className="cart-item-body"><strong className="cart-item-name">{product.name}</strong><span className="cart-item-cost">{points(product.point_cost)}</span>
          {!product.is_available && <span className="badge badge-dot badge-neutral">Unavailable</span>}</div>
        <button className="button button-danger-outline cart-item-remove" disabled={viewingAs || pendingIds.has(product.id)} aria-label={`Remove ${product.name} from cart`} onClick={() => remove(product.id)}>{pendingIds.has(product.id) ? 'Removing…' : 'Remove'}</button>
      </li>)}</ul>
      <Totals total={cart.total_points} balance={cart.point_balance} />
      {error && <p className="banner banner-warning" role="alert">Cart could not be refreshed. Previously loaded information is shown.</p>}
      {viewingAs && <p className="banner">You’re viewing as this driver, so the cart is read-only.</p>}
      <button className="button button-primary" disabled={Boolean(blocked) || status === 'loading' || Boolean(error)} onClick={beginReview}>Check out</button>
      {blocked && !viewingAs && <p className="cart-blocked-reason">{blocked}</p>}
    </div>;
  }

  return <Modal title={title} className="cart-drawer" backdropClassName="cart-drawer-backdrop" onClose={onClose}
    actions={<button className="button" data-autofocus onClick={onClose}>Close</button>}>
    <span className="sr-only" ref={heading} tabIndex={-1}>{title}</span>
    {actionError && <p className="banner banner-error" role="alert">{actionError}</p>}
    {body}
  </Modal>;
}
