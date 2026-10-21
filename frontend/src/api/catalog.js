import { ApiError, readJson, request } from './client';

function readCatalog(data) {
  // A malformed successful response is an error, never an empty catalog.
  const productsValid = Array.isArray(data?.results) && data.results.every((product) => (
    product && Number.isSafeInteger(product.id) && product.id > 0 &&
    typeof product.name === 'string' && product.name.trim() &&
    typeof product.description === 'string' && typeof product.image_url === 'string' &&
    typeof product.price_usd === 'string' && /^\d{1,10}(?:\.\d{1,2})?$/.test(product.price_usd) &&
    typeof product.is_available === 'boolean'
  ));
  const validLink = (value) => value === null || typeof value === 'string';
  if (!productsValid || !Number.isSafeInteger(data.count) || data.count < 0 ||
      !Number.isSafeInteger(data.sponsor?.id) || data.sponsor.id < 1 ||
      typeof data.sponsor.name !== 'string' || !data.sponsor.name.trim() ||
      !validLink(data.next) || !validLink(data.previous)) {
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
  return request(`/catalog/${page === 1 ? '' : `?page=${page}`}`).then(readJson).then(readCatalog);
}
