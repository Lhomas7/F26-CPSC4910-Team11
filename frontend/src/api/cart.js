import { ApiError, readJson, request } from './client';

function readCart(data) {
  // A malformed successful response is an error, never an empty cart.
  if (
    !Array.isArray(data?.results) ||
    !data.results.every((item) => Number.isSafeInteger(item?.product?.id)) ||
    !Number.isSafeInteger(data.item_count) ||
    !Number.isSafeInteger(data.total_points) ||
    !Number.isSafeInteger(data.point_balance)
  ) {
    throw new ApiError('The server returned an invalid cart response.', 502, data);
  }
  return data;
}

export function readCartReview(data) {
  readCart(data);
  if (typeof data.review_token !== 'string' || !data.review_token) {
    throw new ApiError('The server returned an invalid purchase review.', 502, data);
  }
  return data;
}

function readPurchase(purchase) {
  if (!purchase || !Number.isSafeInteger(purchase.redemption_id) || purchase.redemption_id < 1 ||
      typeof purchase.reference !== 'string' || !purchase.reference ||
      !Number.isSafeInteger(purchase.points_spent) || purchase.points_spent < 0 ||
      !(purchase.point_balance === null || (Number.isSafeInteger(purchase.point_balance) && purchase.point_balance >= 0)) ||
      typeof purchase.replayed !== 'boolean' || typeof purchase.completed_at !== 'string' || Number.isNaN(Date.parse(purchase.completed_at)) ||
      !Array.isArray(purchase.line_items) || !purchase.line_items.length ||
      !purchase.line_items.every((row) => typeof row.name === 'string' && row.name &&
        Number.isSafeInteger(row.unit_points) && row.unit_points >= 0 && row.quantity === 1)) {
    throw new ApiError('The purchase receipt could not be confirmed.', 502, purchase);
  }
  const total = purchase.line_items.reduce((sum, row) => sum + row.unit_points, 0);
  if (!Number.isSafeInteger(total) || total !== purchase.points_spent) {
    throw new ApiError('The purchase receipt totals could not be confirmed.', 502, purchase);
  }
  return purchase;
}

export function reviewCart() {
  return request('/cart/review/', { method: 'POST', body: {} }).then(readJson).then(readCartReview);
}

export function lookupRedemption(key) {
  return request(`/cart/redemptions/by-key/${encodeURIComponent(key)}/`)
    .then(readJson).then((data) => readPurchase(data.purchase));
}

function checkProductId(productId) {
  if (!Number.isSafeInteger(productId) || productId < 1) {
    throw new RangeError('Product ID must be a positive whole number.');
  }
}

/** The signed-in driver's cart. Every cart call returns the whole cart. */
export function getCart() {
  return request('/cart/').then(readJson).then(readCart);
}

export function addToCart(productId) {
  checkProductId(productId);
  return request('/cart/items/', { method: 'POST', body: { product_id: productId } })
    .then(readJson)
    .then(readCart);
}

export function removeFromCart(productId) {
  checkProductId(productId);
  return request(`/cart/items/${productId}/`, { method: 'DELETE' }).then(readJson).then(readCart);
}

/** Remove every item from the cart. */
export function clearCart() {
  return request('/cart/', { method: 'DELETE' }).then(readJson).then(readCart);
}

/** Buy everything in the cart. Returns the emptied cart plus a `purchase` summary. */
export function checkout(attempt) {
  return request('/cart/checkout/', { method: 'POST', body: attempt }).then(readJson).then((data) => {
    readCart(data);
    readPurchase(data.purchase);
    return data;
  });
}
