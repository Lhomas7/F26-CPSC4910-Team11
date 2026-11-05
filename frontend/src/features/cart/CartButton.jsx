import { CartIcon } from 'components/primitives/Icons';
import { useCart } from './CartContext';
import CartDrawer from './CartDrawer';
import './CartButton.css';

export default function CartButton() {
  const cart = useCart();
  if (!cart) return null;
  const { itemCount, open, setOpen, pendingAttempt } = cart;
  const label = pendingAttempt ? 'Cart, purchase needs attention' : `Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

  return (
    <div className="cart-button-shell">
      <button
        className={`cart-button${pendingAttempt ? ' is-pending' : ''}`}
        hidden={open}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Cart"
        onClick={() => setOpen(true)}
      >
        <CartIcon size={20} />
        {!pendingAttempt && itemCount > 0 && (
          <span className="cart-count" aria-hidden="true">
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        )}
        {pendingAttempt && <span className="cart-flag" aria-hidden="true">!</span>}
      </button>
      {open && <CartDrawer onClose={() => setOpen(false)} />}
    </div>
  );
}
