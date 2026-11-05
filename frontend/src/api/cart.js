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

/** Buy everything in the cart. Returns the emptied cart plus a `purchase` summary. */
export function checkout() {
  return request('/cart/checkout/', { method: 'POST', body: {} }).then(readJson).then(readCart);
}
