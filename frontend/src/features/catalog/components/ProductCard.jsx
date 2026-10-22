import ClampedText from './ClampedText';
import ProductImage from './ProductImage';
import ProductPricing from './ProductPricing';
import { driverPricingState } from '../utils/pricing';
import './ProductCard.css';

export default function ProductCard({ product, footer, headingLevel = 3, viewer = 'sponsor', pricing, pointBalance }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const unaffordable = viewer === 'driver' && driverPricingState({
    pricing, pointCost: product.point_cost, canAfford: product.can_afford, pointBalance,
  }) === 'short';

  return (
    <li className={`card catalog-product-card${product.is_available ? '' : ' is-unavailable'}${unaffordable ? ' is-unaffordable' : ''}`}>
      <ProductImage src={product.image_url} name={product.name} />
      <div className="catalog-product-body">
        <Heading className="catalog-product-name">{product.name}</Heading>
        <span className={`badge badge-dot ${product.is_available ? 'badge-success' : 'badge-neutral'}`}>
          {product.is_available ? 'Available' : 'Unavailable'}
        </span>
        <ProductPricing priceUsd={product.price_usd} viewer={viewer} pricing={pricing}
          pointCost={product.point_cost} canAfford={product.can_afford} pointBalance={pointBalance} />
        <ClampedText text={product.description} productName={product.name} />
      </div>
      {footer != null && (
        <div className="catalog-product-footer">
          {/* Sponsor-only actions and timestamps are explicitly composed by
              the caller; Driver cards have no default management footer. */}
          {footer}
        </div>
      )}
    </li>
  );
}
