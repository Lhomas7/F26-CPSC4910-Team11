import { readJson, request } from './client';

/**
 * Read the first catalog page through the effective session, including View-As.
 * Ownership is resolved by the server, not accepted as a sponsor ID here.
 * Unconfigured point_cost/can_afford values are null, never zero/false defaults.
 * The placeholder page remains disconnected until the catalog UI is ready.
 */
export function getCatalog() {
  return request('/catalog/').then(readJson);
}
