import { ApiError, readJson, request } from './client';

function isProduct(product) {
  return Boolean(
    product &&
    Number.isSafeInteger(product.id) &&
    product.id > 0 &&
    typeof product.name === 'string' &&
    product.name.trim() &&
    typeof product.description === 'string' &&
    typeof product.image_url === 'string' &&
    typeof product.price_usd === 'string' &&
    /^\d{1,10}(?:\.\d{1,2})?$/.test(product.price_usd) &&
    typeof product.is_available === 'boolean',
  );
}

function readCatalog(data) {
  // A malformed successful response is an error, never an empty catalog.
  const productsValid = Array.isArray(data?.results) && data.results.every(isProduct);
  const validLink = (value) => value === null || typeof value === 'string';
  const pricingValid =
    (data?.pricing?.status === 'configured' &&
      Number.isSafeInteger(data.pricing.points_per_dollar) &&
      data.pricing.points_per_dollar > 0) ||
    (data?.pricing?.status === 'unconfigured' && data.pricing.points_per_dollar === null);
  if (
    !productsValid ||
    !Number.isSafeInteger(data.count) ||
    data.count < 0 ||
    !Number.isSafeInteger(data.sponsor?.id) ||
    data.sponsor.id < 1 ||
    typeof data.sponsor.name !== 'string' ||
    !data.sponsor.name.trim() ||
    !validLink(data.next) ||
    !validLink(data.previous) ||
    !pricingValid ||
    (data.point_balance !== null && !Number.isSafeInteger(data.point_balance))
  ) {
    throw new ApiError('The server returned an invalid catalog response.', 502, data);
  }
  return data;
}

/**
 * Read a catalog page through the effective session, including View-As.
 * Ownership is resolved by the server, not accepted as a sponsor ID here.
 * Unconfigured point_cost/can_afford values are null, never zero/false defaults.
 */
export function getCatalog(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('Catalog page must be a positive whole number.');
  }
  return request(`/catalog/${page === 1 ? '' : `?page=${page}`}`)
    .then(readJson)
    .then(readCatalog);
}

export function setProductAvailability(productId, isAvailable) {
  if (!Number.isSafeInteger(productId) || productId < 1) {
    throw new RangeError('Product ID must be a positive whole number.');
  }
  if (typeof isAvailable !== 'boolean') {
    throw new TypeError('Availability must be a boolean.');
  }
  return request(`/sponsor/catalog/products/${productId}/availability/`, {
    method: 'PATCH',
    body: { is_available: isAvailable },
  })
    .then(readJson)
    .then((product) => {
      // A successful HTTP status alone is not confirmation. Check the returned
      // identity/value and timestamp before changing the displayed status.
      if (
        !isProduct(product) ||
        product.id !== productId ||
        product.is_available !== isAvailable ||
        typeof product.updated_at !== 'string' ||
        Number.isNaN(Date.parse(product.updated_at))
      ) {
        throw new ApiError(
          'The server did not confirm the availability update. Refresh the catalog to verify it.',
          502,
          product,
        );
      }
      return product;
    });
}

export function createProduct(product) {
  return request('/sponsor/catalog/products/', { method: 'POST', body: product }).then(
    async (response) => {
      const created = await readJson(response);
      if (response.status !== 201 || !isProduct(created)) {
        // The POST may have committed despite an unusable confirmation. Do not
        // retry automatically or navigate as though creation was confirmed.
        throw new ApiError(
          'The server did not confirm product creation. Check the catalog before trying again.',
          502,
          created,
        );
      }
      return created;
    },
  );
}
