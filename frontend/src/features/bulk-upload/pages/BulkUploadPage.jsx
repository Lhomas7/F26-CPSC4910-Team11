import { useId, useRef, useState } from 'react';

import { uploadBulkFile } from 'api';
import PageHeader from 'app/PageHeader';
import { useAuth } from 'auth/AuthContext';
import '../BulkUpload.css';

const HEADER = 'Type|Organization|FirstName|LastName|Email|Points|Reason';
const SPONSOR_TEMPLATE = `${HEADER}
# D = driver, S = sponsor. Leave Organization empty to use your own.
D||Jane|Doe|jane.doe@example.com|500|Welcome bonus
D||Sam|Smith|sam.smith@example.com
S||Pat|Boss|pat.boss@example.com
`;
const ADMIN_TEMPLATE = `${HEADER}
# O = organization, D = driver, S = sponsor. Create an organization before using it.
O|Acme Trucking
S|Acme Trucking|Pat|Boss|pat.boss@example.com
D|Acme Trucking|Jane|Doe|jane.doe@example.com|500|Welcome bonus
`;

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Summary({ report }) {
  const { summary } = report;
  const preview = report.dry_run;
  const items = [
    ['Organizations', summary.organizations_created, preview ? 'to create' : 'created'],
    ['New drivers', summary.drivers_created, preview ? 'to create' : 'created'],
    ['Existing drivers', summary.drivers_added, preview ? 'to accept' : 'accepted'],
    ['New sponsors', summary.sponsors_created, preview ? 'to create' : 'created'],
    ['Points', summary.points_total.toLocaleString(), `across ${summary.points_awarded} lines`],
  ];
  return (
    <section aria-label="Upload summary" className="bulk-summary">
      <p className={`banner ${summary.failed ? 'banner-warning' : 'banner-success'}`} role="status">
        {preview ? 'Checked' : 'Uploaded'} {summary.total_rows} lines: {summary.succeeded}{' '}
        {preview ? 'look good' : 'processed'}, {summary.failed} with problems.
        {!preview && summary.failed > 0 && ' The lines that worked were saved.'}
        {!preview &&
          summary.invitations_sent > 0 &&
          ` ${summary.invitations_sent} setup emails were sent.`}
        {preview && ' Nothing has been saved yet.'}
      </p>
      <div className="bulk-stats">
        {items.map(([label, value, note]) => (
          <div className="stat" key={label}>
            <span className="stat-label">{label}</span>
            <strong className="stat-value">{value}</strong>
            <small className="stat-note">{note}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Problems({ report }) {
  const failed = report.results.filter((result) => result.status === 'error');
  if (failed.length === 0) return null;
  return (
    <section className="card bulk-problems" aria-labelledby="bulk-problems-heading">
      <header>
        <h2 id="bulk-problems-heading">Lines to fix ({failed.length})</h2>
        <button
          className="button"
          type="button"
          onClick={() => download('lines-to-fix.txt', `${failed.map((r) => r.raw).join('\n')}\n`)}
        >
          Download these lines
        </button>
      </header>
      <ul>
        {failed.map((result) => (
          <li key={result.line}>
            <strong>Line {result.line}</strong>
            <code>{result.raw}</code>
            <ul>
              {result.errors.map((error) => (
                <li key={`${error.field}-${error.message}`}>
                  {error.field ? `${error.field.replace('_', ' ')}: ` : ''}
                  {error.message}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Successes({ report }) {
  const worked = report.results.filter((result) => result.status !== 'error');
  if (worked.length === 0) return null;
  return (
    <details className="card bulk-successes">
      <summary>
        {report.dry_run ? 'Lines that look good' : 'Lines processed'} ({worked.length})
      </summary>
      <ul>
        {worked.map((result) => (
          <li key={result.line}>
            <strong>Line {result.line}</strong> {result.subject}: {result.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function BulkUploadPage() {
  const { user } = useAuth();
  const isAdmin = user?.account_type === 'admin';
  const inputId = useId();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const run = async (dryRun) => {
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setBusy(true);
    setError('');
    setReport(null);
    try {
      setReport(await uploadBulkFile(file, { dryRun }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = (event) => {
    setFile(event.target.files?.[0] || null);
    setReport(null);
    setError('');
  };

  return (
    <div className="bulk-page">
      <PageHeader
        title="Bulk upload"
        subtitle={
          isAdmin
            ? 'Add organizations, sponsors, and drivers from a file'
            : 'Add drivers and sponsors to your organization from a file'
        }
      />
      <main className="bulk-content">
        <section className="card bulk-card" aria-labelledby="bulk-format-heading">
          <h2 id="bulk-format-heading">File format</h2>
          <p>
            Use a text file with one record per line and the columns separated by the <code>|</code>{' '}
            character:
          </p>
          <pre>{HEADER}</pre>
          <ul>
            {isAdmin && (
              <li>
                <code>O</code> creates an organization. Put it above any line that uses it.
              </li>
            )}
            <li>
              <code>D</code> adds a driver, who is accepted into the program right away. Existing
              drivers keep their account and just receive any points.
            </li>
            <li>
              <code>S</code> adds a sponsor account.
            </li>
            <li>
              {isAdmin
                ? 'Organization is required on D and S lines.'
                : 'Leave Organization empty, or enter your own organization. You cannot add people to another one.'}
            </li>
            <li>
              Points (a whole number) and Reason are optional on D lines. New people get an email to
              choose their password. A CSV file with the columns First Name, Last Name, Email and
              optionally Organization, Points and Reason adds drivers too.
            </li>
          </ul>
          <button
            className="button"
            type="button"
            onClick={() =>
              download('bulk-upload-template.txt', isAdmin ? ADMIN_TEMPLATE : SPONSOR_TEMPLATE)
            }
          >
            Download a template
          </button>
        </section>

        <section className="card bulk-card" aria-labelledby="bulk-upload-heading">
          <h2 id="bulk-upload-heading">Upload a file</h2>
          <label htmlFor={inputId}>File (.txt or .csv, up to 500 lines)</label>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept=".txt,.csv,.psv,text/plain,text/csv"
            onChange={chooseFile}
            disabled={busy}
          />
          <p className="bulk-hint">
            Check the file first to see every problem without saving anything. Lines with problems
            are skipped on upload; the rest are still saved.
          </p>
          <div className="bulk-actions">
            <button className="button" type="button" onClick={() => run(true)} disabled={busy}>
              {busy ? 'Working…' : 'Check file'}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => run(false)}
              disabled={busy}
            >
              Upload file
            </button>
          </div>
          {error && (
            <p className="banner banner-error" role="alert">
              {error}
            </p>
          )}
        </section>

        {report && (
          <>
            <Summary report={report} />
            <Problems report={report} />
            <Successes report={report} />
          </>
        )}
      </main>
    </div>
  );
}
