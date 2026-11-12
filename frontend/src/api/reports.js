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

export async function downloadSalesReport({ groupBy, sponsorId, driverId }, format, signal) {
  const query = queryString({
    group_by: groupBy,
    sponsor_id: sponsorId,
    driver_id: driverId,
    file_format: format,
  });
  const response = await request(`/reports/sales/export/?${query}`, { signal });
  if (!response.ok) await readJson(response);
  const disposition = response.headers.get('Content-Disposition');
  const filename = disposition?.match(/filename="([a-z0-9-]+\.(?:csv|xlsx|pdf|html))"/i)?.[1];
  const fallback =
    format === 'csv-utf8' ? `sales-by-${groupBy}-utf8.csv` : `sales-by-${groupBy}.${format}`;
  return { blob: await response.blob(), filename: filename || fallback };
}
