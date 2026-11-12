import { readJson, request } from './client';

export async function getPurchases(page) {
  return readJson(await request(`/purchases/?page=${page}`));
}

export async function getPurchase(id) {
  return readJson(await request(`/purchases/${id}/`));
}
