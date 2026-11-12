import { readJson, request } from './client';

export async function getPurchases(page) {
  return readJson(await request(`/purchases/?page=${page}`));
}

export async function getPurchase(id) {
  return readJson(await request(`/purchases/${id}/`));
}

export async function getSponsorPurchases(driverId, page, { from, before }) {
  const params = new URLSearchParams({ page });
  if (from) params.set('completed_from', from);
  if (before) params.set('completed_before', before);
  return readJson(await request(`/sponsor/drivers/${driverId}/purchases/?${params}`));
}

export async function getSponsorPurchase(driverId, id) {
  return readJson(await request(`/sponsor/drivers/${driverId}/purchases/${id}/`));
}
