import './ProductGrid.css';

export default function ProductGrid({ children, label = 'Products' }) {
  return (
    <ul className="catalog-product-grid" aria-label={label}>
      {children}
    </ul>
  );
}
