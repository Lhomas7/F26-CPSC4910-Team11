import { useCart } from 'features/cart/CartContext';

/** Switching mid-purchase would separate a checkout from the cart it reviewed. */
export default function useSwitchBlocked() {
  const cart = useCart();
  return Boolean(
    cart && (cart.checkingOut || cart.pendingAttempt || cart.pendingIds.size || cart.clearing),
  );
}
