import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as api from '../../../api';
import { useAuth } from '../../../auth/AuthContext';
import PageHeader from '../../../app/PageHeader';
import SelectMenu from '../../../components/forms/SelectMenu';
import StatePanel from '../../../components/feedback/StatePanel';
import Skeleton from '../../../components/feedback/Skeleton';
import useApiRequest from '../../../hooks/useApiRequest';
import './SalesReportsPage.css';

const GROUP_OPTIONS = [
  { value: 'sponsor', label: 'Sales by sponsor' },
  { value: 'driver', label: 'Sales by driver' },
];
const PAGE_SIZE = 50;

function ReportCell({ label, children }) {
  return (
    <td role="cell">
      <span className="reports-cell-label" aria-hidden="true">{label}</span>
      <span className="reports-cell-value">{children}</span>
    </td>
  );
}

const money = (value, digits) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));

function ReportSkeleton() {
  return (
    <div aria-label="Loading sales report" role="status">
      <div className="reports-summary-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="reports-summary-skeleton" key={index} />
        ))}
      </div>
      <Skeleton className="reports-table-skeleton" />
    </div>
  );
}

export default function SalesReportsPage() {
  const { user } = useAuth();
  const identity = JSON.stringify([user?.id, user?.username, user?.account_type, user?.impersonation]);
  return <SalesReportsSession key={identity} user={user} />;
}

function SalesReportsSession({ user }) {
  const [groupBy, setGroupBy] = useState('sponsor');
  const [sponsorId, setSponsorId] = useState('all');
  const [driverId, setDriverId] = useState('all');
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState('idle');
  const [reportError, setReportError] = useState('');
  const [page, setPage] = useState(1);
  const [submitted, setSubmitted] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const latest = useRef(0);
  const resultsHeading = useRef(null);
  const failedRequest = useRef(null);

  useEffect(() => () => { latest.current += 1; }, []);

  const {
    data: options,
    status: optionsStatus,
    error: optionsError,
    reload: reloadOptions,
  } = useApiRequest(
    useCallback(() => api.getSalesReportOptions(sponsorId), [sponsorId]),
    { skip: user?.account_type !== 'admin' || accessDenied },
  );

  useEffect(() => {
    document.title = 'Sales reports | Good Driver Incentive Program';
  }, []);

  const sponsorOptions = useMemo(
    () => [
      { value: 'all', label: 'All sponsors' },
      ...(options?.sponsors || []).map((sponsor) => ({
        value: String(sponsor.id),
        label: sponsor.name,
      })),
    ],
    [options?.sponsors],
  );
  const driverOptions = useMemo(
    () => [
      { value: 'all', label: 'All drivers' },
      ...(options?.drivers || []).map((driver) => ({
        value: String(driver.id),
        label: driver.name,
        meta: `@${driver.username}`,
      })),
    ],
    [options?.drivers],
  );

  const resetReport = () => {
    // Editing draft selections must not erase a failed submitted request.
  };

  const changeGroup = (value) => {
    setGroupBy(value);
    if (value === 'sponsor') setDriverId('all');
    resetReport();
  };

  const changeSponsor = (value) => {
    setSponsorId(value);
    setDriverId('all');
    resetReport();
  };

  const runReport = async (nextPage = 1, scope = null, moveFocus = true) => {
    if (accessDenied || user?.account_type !== 'admin') return;
    const requestId = ++latest.current;
    const pending = scope || {
      groupBy, sponsorId, driverId,
      sponsorName: sponsorOptions.find((item) => item.value === sponsorId)?.label || 'All organizations',
      driverName: driverOptions.find((item) => item.value === driverId)?.label || 'All Drivers',
      driverUsername: driverOptions.find((item) => item.value === driverId)?.meta || '',
    };
    failedRequest.current = { scope: pending, page: nextPage };
    setReportStatus('loading');
    setReportError('');
    try {
      const result = await api.getSalesReport({
        groupBy: pending.groupBy,
        sponsorId: pending.sponsorId,
        driverId: pending.driverId,
        page: nextPage,
      });
      if (requestId !== latest.current) return;
      setReport(result);
      setSubmitted(pending);
      setPage(nextPage);
      setReportStatus('ready');
      if (moveFocus) window.setTimeout(() => {
        if (requestId === latest.current) resultsHeading.current?.focus();
      }, 0);
    } catch (error) {
      if (requestId !== latest.current) return;
      if ([401, 403, 409].includes(error.status)) {
        setReport(null);
        setSubmitted(null);
        setAccessDenied(true);
        return;
      }
      setReportError(error.message || 'The sales report could not be loaded.');
      setReportStatus('error');
    }
  };

  const resultGroup = report?.scope?.group_by || submitted?.groupBy || groupBy;
  const scopeText = submitted ? [
    resultGroup === 'driver' ? 'Sales by Driver' : 'Sales by sponsor',
    submitted.sponsorId === 'all' ? 'All organizations' : submitted.sponsorName,
    ...(resultGroup === 'driver' && submitted.sponsorId !== 'all'
      ? [submitted.driverId === 'all' ? 'All Drivers' : `${submitted.driverName} ${submitted.driverUsername}`] : []),
  ].join(' · ') : '';
  const selectionsChanged = submitted && (submitted.groupBy !== groupBy || submitted.sponsorId !== sponsorId || submitted.driverId !== driverId);
  const rate = report ? Number(report.summary.project_share_rate_percent).toLocaleString('en-US') : '1';

  if (user?.account_type !== 'admin' || accessDenied || [401, 403, 409].includes(optionsError?.status)) {
    return (
      <main className="reports-page">
        <PageHeader title="Sales reports" subtitle="Administrator sales reporting" />
        <StatePanel headingLevel={2} title="You don't have access to this page">
          <p>Only administrators can run organization-wide sales reports.</p>
        </StatePanel>
      </main>
    );
  }

  return (
    <div className="reports-page">
      <PageHeader title="Sales reports" subtitle="Audit completed sales and the project's 1% share" />
      <main className="reports-content">
        <p className="sr-only" role="status" aria-live="polite">{reportStatus === 'loading' ? 'Running sales report' : reportStatus === 'ready' ? `Report ready. ${report?.count || 0} grouped rows.` : reportError}</p>
        {optionsStatus === 'loading' && !options && (
          <Skeleton className="reports-controls-skeleton" aria-label="Loading report filters" />
        )}
        {optionsStatus === 'error' && !options && (
          <StatePanel tone="error" title="Report filters couldn't be loaded">
            <p>Check the server connection and try again.</p>
            <button className="button button-primary" type="button" onClick={reloadOptions}>
              Try again
            </button>
          </StatePanel>
        )}
        {options && (
          <section className="card reports-controls" aria-labelledby="report-scope-heading">
            <div>
              <h2 id="report-scope-heading">Report scope</h2>
              <p>Choose how to group the report, then narrow it to an organization or Driver.</p>
            </div>
            <div className="reports-filter-grid">
              <label>
                <span>Report</span>
                <SelectMenu
                  label="Report type"
                  value={groupBy}
                  options={GROUP_OPTIONS}
                  onChange={changeGroup}
                />
              </label>
              <label>
                <span>Sponsor organization</span>
                <SelectMenu
                  label="Sponsor organization"
                  value={sponsorId}
                  options={sponsorOptions}
                  onChange={changeSponsor}
                  searchable
                />
              </label>
              {groupBy === 'driver' && sponsorId !== 'all' && (
                <label>
                  <span>Driver</span>
                  <SelectMenu
                    label="Driver"
                    disabled={optionsStatus !== 'ready' || !options.drivers.length}
                    value={driverId}
                    options={driverOptions}
                    onChange={(value) => {
                      setDriverId(value);
                      resetReport();
                    }}
                    searchable
                  />
                </label>
              )}
              {groupBy === 'driver' && sponsorId !== 'all' && optionsStatus !== 'ready' && (
                <p className="reports-scope-note">{optionsStatus === 'loading' ? 'Loading Drivers…' : 'Drivers could not be loaded. You can still report on all Drivers.'}
                  {optionsStatus === 'error' && <button className="button" type="button" onClick={reloadOptions}>Retry Driver options</button>}
                </p>
              )}
              {groupBy === 'driver' && sponsorId !== 'all' && optionsStatus === 'ready' && !options.drivers.length && <p className="reports-scope-note">No individual Drivers are available. Reports can still include historical sales.</p>}
              <button
                className="button button-primary reports-run"
                type="button"
                onClick={() => runReport(1)}
                disabled={reportStatus === 'loading'}
              >
                {reportStatus === 'loading' ? 'Running…' : 'Run report'}
              </button>
            </div>
          </section>
        )}

        {reportStatus === 'idle' && optionsStatus === 'ready' && (
          <StatePanel className="reports-state" title="Choose a report scope">
            <p>Run the report to see completed sales, gross revenue, and the 1% project share.</p>
          </StatePanel>
        )}
        {reportStatus === 'loading' && <ReportSkeleton />}
        {reportStatus === 'error' && (
          <StatePanel className="reports-state" tone="error" title="Sales report couldn't be loaded">
            <p>{reportError}</p>
            {report && <p>These are the previous results from the scope named below.</p>}
            <button className="button button-primary" type="button" onClick={() => runReport(failedRequest.current.page, failedRequest.current.scope, false)}>
              Try again
            </button>
          </StatePanel>
        )}
        {report && reportStatus !== 'loading' && (
          <section className="reports-results" aria-labelledby="sales-results-heading">
            <h2 ref={resultsHeading} tabIndex={-1} id="sales-results-heading">Results</h2>
            <p className="reports-scope">{scopeText}</p>
            {resultGroup === 'driver' && <p className="reports-scope-note">Grouped by Driver and the organization recorded on each sale.</p>}
            {selectionsChanged && <p className="banner banner-warning">Selections changed. Run report to update these results.</p>}
            <div className="reports-summary-grid">
              <article className="stat reports-summary">
                <span className="stat-label">Completed sales</span>
                <strong className="stat-value">{report.summary.sale_count.toLocaleString('en-US')}</strong>
                <small className="stat-note">Across the entire scope</small>
              </article>
              <article className="stat reports-summary">
                <span className="stat-label">Gross sales</span>
                <strong className="stat-value">{money(report.summary.gross_sales_usd, 2)}</strong>
                <small className="stat-note">Across the entire scope</small>
              </article>
              <article className="stat stat-highlight reports-summary">
                <span className="stat-label">Project share ({rate}%)</span>
                <strong className="stat-value">{money(report.summary.project_share_usd, 4)}</strong>
                <small className="stat-note">Exact {rate}% share, including fractional cents</small>
              </article>
            </div>
            {report.results.length === 0 ? (
              <StatePanel className="reports-state" title="No completed sales in this scope">
                <p>Try a broader sponsor or Driver selection.</p>
              </StatePanel>
            ) : (
              <div className="card reports-table-card">
                <table role="table">
                  <caption className="sr-only">{scopeText}</caption>
                  <thead role="rowgroup">
                    <tr role="row">
                      <th scope="col" role="columnheader">{resultGroup === 'sponsor' ? 'Sponsor organization' : 'Driver'}</th>
                      {resultGroup === 'driver' && <th scope="col" role="columnheader">Organization on sale</th>}
                      <th scope="col" role="columnheader">Completed sales</th>
                      <th scope="col" role="columnheader">Gross sales</th>
                      <th scope="col" role="columnheader">Project share ({rate}%)</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {report.results.map((row) => (
                      <tr role="row" key={`${row.sponsor.id}-${row.driver?.id || 'sponsor'}`}>
                        <ReportCell label={resultGroup === 'sponsor' ? 'Sponsor organization' : 'Driver'}>
                          <strong>{resultGroup === 'sponsor' ? row.sponsor.name : row.driver.name}</strong>
                          {resultGroup === 'driver' && <small>@{row.driver.username}</small>}
                        </ReportCell>
                        {resultGroup === 'driver' && (
                          <ReportCell label="Organization on sale">{row.sponsor.name}</ReportCell>
                        )}
                        <ReportCell label="Completed sales">{row.sale_count.toLocaleString('en-US')}</ReportCell>
                        <ReportCell label="Gross sales">{money(row.gross_sales_usd, 2)}</ReportCell>
                        <ReportCell label={`Project share (${rate}%)`}>{money(row.project_share_usd, 4)}</ReportCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report.count > PAGE_SIZE && (
              <nav className="reports-pagination" aria-label="Sales report pages">
                <span className="reports-pagination-range">Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString('en-US')}–{Math.min((page - 1) * PAGE_SIZE + report.results.length, report.count).toLocaleString('en-US')} of {report.count.toLocaleString('en-US')} grouped rows</span>
                <button className="button" type="button" disabled={!report.previous} onClick={() => runReport(page - 1, submitted, false)}>
                  Previous
                </button>
                <span>Page {page} of {Math.ceil(report.count / PAGE_SIZE)}</span>
                <button className="button" type="button" disabled={!report.next} onClick={() => runReport(page + 1, submitted, false)}>
                  Next
                </button>
              </nav>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

