import { readJson, request } from './client';

/** Who the signed-in user can contact for help: their sponsors and site support. */
export function getHelpContacts() {
  return request('/help/contacts/').then(readJson);
}
