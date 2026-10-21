import './ProductPricing.css';

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function ProductPricing({ priceUsd }) {
  // Validate the decimal-string shape before formatting. In particular,
  // Number(null) and Number('') must not turn missing data into a free reward.
  const validPrice = typeof priceUsd === 'string' && /^\d{1,10}(?:\.\d{1,2})?$/.test(priceUsd);

  return (
    <div className="catalog-product-price-block">
      <span className="catalog-product-price">
        {validPrice ? usdFormat.format(Number(priceUsd)) : 'Price unavailable'}
      </span>
      {/* Conversion is not implemented. This is neither zero points nor an
          affordability verdict, even when the stored USD amount is zero. */}
      <span className="catalog-product-points">Point cost: Not configured</span>
    </div>
  );
}
