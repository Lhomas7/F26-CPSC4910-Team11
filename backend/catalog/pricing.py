from decimal import ROUND_CEILING


def point_cost(price_usd, points_per_dollar):
    """Convert exact stored USD into whole points, never rounding a cost down."""
    return int((price_usd * points_per_dollar).to_integral_value(rounding=ROUND_CEILING))
