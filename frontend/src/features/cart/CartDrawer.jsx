import { useEffect, useState } from 'react';

import Modal from 'components/feedback/Modal';
import ProductImage from 'features/catalog/components/ProductImage';
import { useCart } from './CartContext';
import './CartDrawer.css';

const numbers = new Intl.NumberFormat('en-US');

function points(value) {
  return `${numbers.format(value)} ${value === 1 ? 'point' : 'points'}`;
}

function accessMessage(error) {
  const code = error?.data?.code;
  if (code === 'driver_not_approved') {
    return 'Your sponsor must approve your Driver account before you can use a cart.';
  }
  if (code === 'sponsor_required') {
    return 'You need to be linked to a sponsor before you can use a cart.';
  }
  return error?.message || 'Your cart couldn’t be loaded. Try again in a moment.';
}

function CartItem({ item, busy, readOnly, onRemove }) {
  const { product } = item;
  return (
    <li className="cart-item">
      <div className="cart-item-image">
        <ProductImage src={product.image_url} name={product.name} emptyText="" failedText="" />
      </div>
      <div className="cart-item-body">
        <strong className="cart-item-name">{product.name}</strong>
        <span className="cart-item-cost">
          {Number.isSafeInteger(product.point_cost)
            ? points(product.point_cost)
            : 'Point cost unavailable'}
        </span>
        {!product.is_available && (
          <span className="badge badge-dot badge-neutral">Unavailable</span>
        )}
      </div>
      <button
        className="button button-danger-outline cart-item-remove"
        type="button"
        disabled={busy || readOnly}
        aria-label={`Remove ${product.name} from cart`}
        onClick={() => onRemove(product.id)}
      >
        {busy ? 'Removing…' : 'Remove'}
      </button>
    </li>
  );
}

export default function CartDrawer({ onClose }) {
  const {
    cart,
    status,
    error,
    actionError,
    clearActionError,
    pendingIds,
    viewingAs,
    reload,
    remove,
    checkout,
    checkingOut,
    lastPurchase,
    clearLastPurchase,
  } = useCart();
  const [confirming, setConfirming] = useState(false);

  // Refresh on open so prices and availability changed elsewhere are current.
  useEffect(() => {
    reload();
    return () => {
      clearActionError();
      clearLastPurchase();
    };
  }, [reload, clearActionError, clearLastPurchase]);

  const items = cart?.results ?? [];
  const shortfall = cart ? cart.total_points - cart.point_balance : 0;
  const hasUnavailable = items.some((item) => !item.product.is_available);
  const canCheckOut =
    items.length > 0 && shortfall <= 0 && !hasUnavailable && !viewingAs && !checkingOut;

  const confirmPurchase = async () => {
    await checkout();
    setConfirming(false);
  };

  let body;
  if (!cart && status === 'loading') {
    body = <p role="status">Loading your cart…</p>;
  } else if (!cart && error) {
    body = (
      <div className="cart-drawer-state">
        <p>{accessMessage(error)}</p>
        {![401, 403].includes(error.status) && (
          <button className="button" type="button" onClick={reload}>
            Try again
          </button>
        )}
      </div>
    );
  } else if (!items.length && lastPurchase) {
    body = (
      <div className="cart-drawer-state" role="status">
        <p className="banner banner-success">
          Purchase complete: {points(lastPurchase.points_spent)} spent. Your new balance is{' '}
          {points(lastPurchase.point_balance)}.
        </p>
        <p>
          You bought {lastPurchase.items.length}{' '}
          {lastPurchase.items.length === 1 ? 'reward' : 'rewards'}: {lastPurchase.items.join(', ')}.
        </p>
      </div>
    );
  } else if (!items.length) {
    body = (
      <div className="cart-drawer-state">
        <p>Your cart is empty.</p>
        <p>Use Add to cart on a reward in the catalog to save it here.</p>
      </div>
    );
  } else {
    body = (
      <>
        <ul className="cart-items" aria-label="Rewards in your cart">
          {items.map((item) => (
            <CartItem
              key={item.id}
              item={item}
              busy={pendingIds.has(item.product.id)}
              readOnly={viewingAs}
              onRemove={remove}
            />
          ))}
        </ul>
        <dl className="cart-summary">
          <div>
            <dt>Total</dt>
            <dd>{points(cart.total_points)}</dd>
          </div>
          <div>
            <dt>Your balance</dt>
            <dd>{points(cart.point_balance)}</dd>
          </div>
        </dl>
        {shortfall > 0 && (
          <p className="banner banner-warning">
            You need {points(shortfall)} more to buy everything in your cart.
          </p>
        )}
        {hasUnavailable && (
          <p className="banner">Unavailable rewards can’t be purchased. You can remove them.</p>
        )}
        {confirming ? (
          <div className="cart-checkout-confirm" role="group" aria-label="Confirm purchase">
            <p>
              Spend {points(cart.total_points)} on {items.length}{' '}
              {items.length === 1 ? 'reward' : 'rewards'}? Your balance will be{' '}
              {points(cart.point_balance - cart.total_points)}.
            </p>
            <div className="cart-checkout-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={!canCheckOut}
                onClick={confirmPurchase}
              >
                {checkingOut ? 'Purchasing…' : 'Confirm purchase'}
              </button>
              <button
                className="button"
                type="button"
                disabled={checkingOut}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="button button-primary button-full-width"
            type="button"
            disabled={!canCheckOut}
            onClick={() => setConfirming(true)}
          >
            Check out
          </button>
        )}
      </>
    );
  }

  return (
    <Modal
      title={cart ? `Your cart (${cart.item_count})` : 'Your cart'}
      className="cart-drawer"
      backdropClassName="cart-drawer-backdrop"
      onClose={onClose}
      actions={
        <button className="button" type="button" data-autofocus onClick={onClose}>
          Close
        </button>
      }
    >
      {viewingAs && (
        <p className="banner">You’re viewing as this driver, so the cart is read-only.</p>
      )}
      {actionError && (
        <p className="banner banner-error" role="alert">
          {actionError}
        </p>
      )}
      {body}
    </Modal>
  );
}
