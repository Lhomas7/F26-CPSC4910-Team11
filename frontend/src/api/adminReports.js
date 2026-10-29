import { API_URL, readJson, request } from './client';

function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Audit events between two dates (YYYY-MM-DD, both days included). */
export function getAuditLog({ start, end, category, limit } = {}) {
  return request(`/admin/audit-log/${queryString({ start, end, category, limit })}`).then(readJson);
}

/** Where to download the same audit-log selection as a CSV file. */
export function auditLogCsvUrl({ start, end, category } = {}) {
  return `${API_URL}/admin/audit-log/${queryString({ start, end, category, export: 'csv' })}`;
}

/** An invoice for one sponsor covering the billing period start..end. */
export function getInvoice({ sponsor, start, end }) {
  return request(`/admin/invoices/${queryString({ sponsor, start, end })}`).then(readJson);
}
