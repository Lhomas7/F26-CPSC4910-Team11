import ClampedText from './ClampedText';
import ProductImage from './ProductImage';
import ProductPricing from './ProductPricing';
import './ProductCard.css';

const updatedFormat = new Intl.DateTimeFormat('en-US', {
  month: 'numeric', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});

export default function ProductCard({ product, footer, headingLevel = 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const updated = product.updated_at ? new Date(product.updated_at) : null;
  const validUpdated = updated && !Number.isNaN(updated.getTime());

  return (
    <li className={`card catalog-product-card${product.is_available ? '' : ' is-unavailable'}`}>
      <ProductImage src={product.image_url} name={product.name} />
      <div className="catalog-product-body">
        <Heading className="catalog-product-name">{product.name}</Heading>
        <span className={`badge badge-dot ${product.is_available ? 'badge-success' : 'badge-neutral'}`}>
          {product.is_available ? 'Available' : 'Unavailable'}
        </span>
        <ProductPricing priceUsd={product.price_usd} />
        <ClampedText text={product.description} productName={product.name} />
      </div>
      {(footer != null || validUpdated) && (
        <div className="catalog-product-footer">
          {/* The Sponsor page supplies its availability control here. A
              Driver card can use the same shell without management actions. */}
          {footer}
          {validUpdated && (
            <time className="catalog-product-updated" dateTime={product.updated_at}>
              Updated {updatedFormat.format(updated)}
            </time>
          )}
        </div>
      )}
    </li>
  );
}
