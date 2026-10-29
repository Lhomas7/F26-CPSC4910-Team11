import { useCallback, useEffect, useMemo, useState } from 'react';

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
  const [groupBy, setGroupBy] = useState('sponsor');
  const [sponsorId, setSponsorId] = useState('all');
  const [driverId, setDriverId] = useState('all');
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState('idle');
  const [reportError, setReportError] = useState('');
  const [page, setPage] = useState(1);

  const {
    data: options,
    status: optionsStatus,
    reload: reloadOptions,
  } = useApiRequest(
    useCallback(() => api.getSalesReportOptions(sponsorId), [sponsorId]),
    { skip: user?.account_type !== 'admin' },
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
    setReport(null);
    setReportStatus('idle');
    setReportError('');
    setPage(1);
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

  const runReport = async (nextPage = 1) => {
    setReportStatus('loading');
    setReportError('');
    try {
      const result = await api.getSalesReport({
        groupBy,
        sponsorId,
        driverId,
        page: nextPage,
      });
      setReport(result);
      setPage(nextPage);
      setReportStatus('ready');
    } catch (error) {
      setReportError(error.message || 'The sales report could not be loaded.');
      setReportStatus('error');
    }
  };

  if (user?.account_type !== 'admin' || optionsStatus === 'forbidden') {
    return (
      <main className="reports-page">
        <StatePanel headingLevel={1} title="You don't have access to this page">
          <p>Only administrators can run organization-wide sales reports.</p>
        </StatePanel>
      </main>
    );
  }

  return (
    <div className="reports-page">
      <PageHeader title="Sales reports" subtitle="Audit completed sales and the project's 1% share" />
      <main className="reports-content">
        {optionsStatus === 'loading' && (
          <Skeleton className="reports-controls-skeleton" aria-label="Loading report filters" />
        )}
        {optionsStatus === 'error' && (
          <StatePanel tone="error" title="Report filters couldn't be loaded">
            <p>Check the server connection and try again.</p>
            <button className="button button-primary" type="button" onClick={reloadOptions}>
              Try again
            </button>
          </StatePanel>
        )}
        {optionsStatus === 'ready' && (
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
            <button className="button button-primary" type="button" onClick={() => runReport(page)}>
              Try again
            </button>
          </StatePanel>
        )}
        {reportStatus === 'ready' && report && (
          <section aria-labelledby="sales-results-heading">
            <h2 className="sr-only" id="sales-results-heading">Sales report results</h2>
            <div className="reports-summary-grid">
              <article className="card reports-summary">
                <span>Completed sales</span>
                <strong>{report.summary.sale_count.toLocaleString('en-US')}</strong>
              </article>
              <article className="card reports-summary">
                <span>Gross sales</span>
                <strong>{money(report.summary.gross_sales_usd, 2)}</strong>
              </article>
              <article className="card reports-summary">
                <span>Project share (1%)</span>
                <strong>{money(report.summary.project_share_usd, 4)}</strong>
              </article>
            </div>
            {report.results.length === 0 ? (
              <StatePanel className="reports-state" title="No completed sales in this scope">
                <p>Try a broader sponsor or Driver selection.</p>
              </StatePanel>
            ) : (
              <div className="card reports-table-card">
                <table>
                  <thead>
                    <tr>
                      <th>{groupBy === 'sponsor' ? 'Sponsor organization' : 'Driver'}</th>
                      {groupBy === 'driver' && <th>Sponsor organization</th>}
                      <th>Completed sales</th>
                      <th>Gross sales</th>
                      <th>Project share (1%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.map((row) => (
                      <tr key={`${groupBy}-${groupBy === 'sponsor' ? row.sponsor.id : row.driver.id}`}>
                        <td data-label={groupBy === 'sponsor' ? 'Sponsor organization' : 'Driver'}>
                          <strong>{groupBy === 'sponsor' ? row.sponsor.name : row.driver.name}</strong>
                          {groupBy === 'driver' && <small>@{row.driver.username}</small>}
                        </td>
                        {groupBy === 'driver' && (
                          <td data-label="Sponsor organization">{row.sponsor.name}</td>
                        )}
                        <td data-label="Completed sales">{row.sale_count.toLocaleString('en-US')}</td>
                        <td data-label="Gross sales">{money(row.gross_sales_usd, 2)}</td>
                        <td data-label="Project share (1%)">{money(row.project_share_usd, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report.count > 50 && (
              <nav className="reports-pagination" aria-label="Sales report pages">
                <button className="button" type="button" disabled={!report.previous} onClick={() => runReport(page - 1)}>
                  Previous
                </button>
                <span>Page {page} of {Math.ceil(report.count / 50)}</span>
                <button className="button" type="button" disabled={!report.next} onClick={() => runReport(page + 1)}>
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

