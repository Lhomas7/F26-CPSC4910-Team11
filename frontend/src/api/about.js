import { readJson, request } from './client';

// The release shown on the About page; null when none has been published.
export function currentRelease() {
  return request('/about/').then((response) => (
    response.status === 404 ? null : readJson(response)
  ));
}
