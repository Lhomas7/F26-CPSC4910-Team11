import { readJson, request } from './client';

/**
 * Reserved catalog read boundary; the page must not call this until the backend
 * endpoint exists. The server will resolve organization ownership from the
 * effective session, including View-As, rather than accept a sponsor ID here.
 * Leave product fields and pagination unspecified until that contract is agreed.
 */
export function getCatalog() {
  return request('/catalog/').then(readJson);
}
