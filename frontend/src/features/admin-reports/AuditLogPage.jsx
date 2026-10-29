import { useCallback, useEffect, useState } from 'react';

import * as api from '../../api';
import { useAuth } from '../../auth/AuthContext';
import PageHeader from '../../app/PageHeader';
import StatePanel from '../../components/feedback/StatePanel';
import useApiRequest from '../../hooks/useApiRequest';
import { daysAgo, formatDay, rangeProblem, toInputDate } from './dates';
import './AdminReports.css';

const CATEGORIES = [
  { value: 'all', label: 'All activity' },
  { value: 'sign_in', label: 'Sign-ins' },
  { value: 'points', label: 'Point changes' },
  { value: 'membership', label: 'Driver membership' },
  { value: 'impersonation', label: 'View-as sessions' },
  { value: 'admin_password_reset', label: 'Administrator password resets' },
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(({ value, label }) => [value, label]));

function humanize(action) {
  const text = action.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [form, setForm] = useState(() => ({
    start: toInputDate(daysAgo(30)),
    end: toInputDate(new Date()),
    category: 'all',
  }));
  // The report only reloads when the admin applies the form, not on every keystroke.
  const [filters, setFilters] = useState(form);
  const [formError, setFormError] = useState('');

  const { data, status, error, reload } = useApiRequest(
    useCallback(() => api.getAuditLog(filters), [filters]),
    { skip: user?.account_type !== 'admin' },
  );

  useEffect(() => {
    document.title = 'Audit log | Good Driver Incentive Program';
  }, []);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const apply = (event) => {
    event.preventDefault();
    const problem = rangeProblem(form);
    setFormError(problem);
    if (!problem) setFilters(form);
  };

  if (user?.account_type !== 'admin' || status === 'forbidden') {
    return (
      <main className="reports-page">
        <StatePanel headingLevel={1} title="You don't have access to this page">
          <p>Only administrators can view the audit log.</p>
        </StatePanel>
      </main>
    );
  }

  const results = data?.results || [];

  return (
    <div className="reports-page">
      <PageHeader
        title="Audit log"
        subtitle="Investigate sign-ins, point changes, and account activity for a period"
      />
      <main className="reports-content" aria-busy={status === 'loading'}>
        <form className="card reports-filters" onSubmit={apply} noValidate>
          <div className="reports-field">
            <label htmlFor="audit-start">Start date</label>
            <input
              id="audit-start"
              type="date"
              value={form.start}
              max={form.end || undefined}
              onChange={update('start')}
            />
          </div>
          <div className="reports-field">
            <label htmlFor="audit-end">End date</label>
            <input
              id="audit-end"
              type="date"
              value={form.end}
              min={form.start || undefined}
              onChange={update('end')}
            />
          </div>
          <div className="reports-field">
            <label htmlFor="audit-category">Activity</label>
            <select id="audit-category" value={form.category} onChange={update('category')}>
              {CATEGORIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button className="button button-primary" type="submit">
            Apply
          </button>
          <a className="button" href={api.auditLogCsvUrl(filters)} download>
            Download CSV
          </a>
        </form>

        {formError && (
          <p className="banner banner-error" role="alert">
            {formError}
          </p>
        )}

        {status === 'loading' && (
          <p role="status" aria-live="polite">
            Loading audit log
          </p>
        )}
        {status === 'error' && (
          <StatePanel tone="error" title="The audit log couldn't be loaded">
            <p>{error?.message || 'Check your connection and try again.'}</p>
            <button className="button button-primary" type="button" onClick={reload}>
              Try again
            </button>
          </StatePanel>
        )}
        {status === 'ready' && results.length === 0 && (
          <StatePanel title="No activity in this period">
            <p>
              Nothing was recorded between {formatDay(filters.start)} and {formatDay(filters.end)}.
              Try a wider date range.
            </p>
          </StatePanel>
        )}
        {status === 'ready' && results.length > 0 && (
          <section aria-labelledby="audit-results-heading">
            <h2 className="reports-count" id="audit-results-heading">
              {results.length} {results.length === 1 ? 'event' : 'events'}, {formatDay(filters.start)}{' '}
              to {formatDay(filters.end)}
            </h2>
            {data.truncated && (
              <p className="banner banner-warning" role="status">
                Only the newest {data.limit} events are shown. Narrow the date range, or download
                the CSV for the full list.
              </p>
            )}
            <div className="card reports-table-card">
              <table>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Activity</th>
                    <th scope="col">Action</th>
                    <th scope="col">By</th>
                    <th scope="col">Account</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.timestamp).toLocaleString()}</td>
                      <td>{CATEGORY_LABELS[event.category] || event.category}</td>
                      <td>{humanize(event.action)}</td>
                      <td>{event.actor || '—'}</td>
                      <td>{event.target || '—'}</td>
                      <td>{event.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
