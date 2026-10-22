// The server owns conversion and rounding. This only checks whether its
// cost/balance/verdict agree before showing a Driver an affordability claim.
export function driverPricingState({ pricing, pointCost, canAfford, pointBalance }) {
  if (pricing?.status === 'unconfigured') return 'unconfigured';
  if (pricing?.status !== 'configured' ||
      !Number.isSafeInteger(pricing.points_per_dollar) || pricing.points_per_dollar < 1 ||
      !Number.isSafeInteger(pointCost) || pointCost < 0 ||
      !Number.isSafeInteger(pointBalance) || typeof canAfford !== 'boolean' ||
      canAfford !== (pointBalance >= pointCost) ||
      (!canAfford && !Number.isSafeInteger(pointCost - pointBalance))) return 'unknown';
  return canAfford ? 'within' : 'short';
}
