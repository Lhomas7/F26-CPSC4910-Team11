import { readJson, request } from './client';

function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export function getSalesReportOptions(sponsorId = 'all') {
  const query = queryString({ sponsor_id: sponsorId });
  return request(`/reports/sales/options/${query ? `?${query}` : ''}`).then(readJson);
}

export function getSalesReport({ groupBy, sponsorId = 'all', driverId = 'all', page = 1 }) {
  const query = queryString({
    group_by: groupBy,
    sponsor_id: sponsorId,
    driver_id: driverId,
    page,
  });
  return request(`/reports/sales/?${query}`).then(readJson);
}
