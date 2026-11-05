import { useEffect, useRef } from 'react';

import { useCart } from '../../cart/CartContext';

/** Add a reward to, or remove it from, the driver's cart. */
export default function DriverProductFooter({ product, cart }) {
  // Until the cart loads, trust the catalog's own in_cart flag.
  const inCart = cart.productIds ? cart.productIds.has(product.id) : Boolean(product.in_cart);
  const busy = cart.pendingIds.has(product.id);

  if (inCart) {
    return (
      <div className="catalog-cart-action">
        <span className="badge badge-dot badge-success">In cart</span>
        <button
          className="button button-danger-outline"
          type="button"
          disabled={busy || cart.viewingAs}
          aria-label={`Remove ${product.name} from cart`}
          onClick={() => cart.remove(product.id)}
        >
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    );
  }
  return (
    <button
      className="button button-primary"
      type="button"
      disabled={busy || cart.viewingAs || !product.is_available}
      aria-label={`Add ${product.name} to cart`}
      onClick={() => cart.add(product.id)}
    >
      {busy ? 'Adding…' : product.is_available ? 'Add to cart' : 'Unavailable'}
    </button>
  );
}

export function useDriverProductFooter() {
  const cart = useCart();
  // Outside a driver's CartProvider there is no cart to act on.
  return cart ? (product) => <DriverProductFooter product={product} cart={cart} /> : () => null;
}

/** Re-run `reload` after each purchase, since checkout changes the balance. */
export function useReloadAfterPurchase(reload) {
  const purchaseVersion = useCart()?.purchaseVersion ?? 0;
  const seen = useRef(purchaseVersion);
  useEffect(() => {
    if (purchaseVersion === seen.current) return;
    seen.current = purchaseVersion;
    reload();
  }, [purchaseVersion, reload]);
}
