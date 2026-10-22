import './ProductPricing.css';
import { CheckIcon, InfoIcon } from '../../../components/primitives/Icons';
import { driverPricingState } from '../utils/pricing';

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const pointsFormat = new Intl.NumberFormat('en-US');
const points = (value) => `${pointsFormat.format(value)} ${value === 1 ? 'point' : 'points'}`;

export default function ProductPricing({ priceUsd, viewer = 'sponsor', pricing, pointCost, canAfford, pointBalance }) {
  // Validate the decimal-string shape before formatting. In particular,
  // Number(null) and Number('') must not turn missing data into a free reward.
  const validPrice = typeof priceUsd === 'string' && /^\d{1,10}(?:\.\d{1,2})?$/.test(priceUsd);
  const validCost = Number.isSafeInteger(pointCost) && pointCost >= 0;
  if (viewer === 'driver') {
    const state = driverPricingState({ pricing, pointCost, canAfford, pointBalance });
    const known = state === 'within' || state === 'short';
    const needed = state === 'short' ? pointCost - pointBalance : null;
    return (
      <div className="catalog-product-price-block">
        <span className={`catalog-product-price${known || (state === 'unknown' && validCost) ? '' : ' is-unset'}`}>
          {state === 'unconfigured' ? 'Point cost: Not configured' : validCost ? points(pointCost) : 'Point cost unavailable'}
        </span>
        {state !== 'unconfigured' && (
          <span className={`catalog-product-afford is-${state}`}>
            {state === 'within' ? <CheckIcon size={14} /> : <InfoIcon size={14} />}
            <span>{state === 'within' ? 'Within your balance' : state === 'short'
              ? `Need ${pointsFormat.format(needed)} more ${needed === 1 ? 'point' : 'points'}`
              : 'We can’t confirm this cost right now. Refresh to try again.'}</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="catalog-product-price-block">
      <span className="catalog-product-price">
        {validPrice ? usdFormat.format(Number(priceUsd)) : 'Price unavailable'}
      </span>
      <span className="catalog-product-points">
        {pricing?.status === 'configured'
          ? validCost ? `Point cost: ${points(pointCost)}` : 'Point cost unavailable'
          : 'Point cost: Not configured'}
      </span>
    </div>
  );
}
