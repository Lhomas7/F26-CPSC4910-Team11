import { useEffect, useState } from 'react';

import * as api from '../../api';
import { useAuth } from '../../auth/AuthContext';
import PageHeader from '../../app/PageHeader';
import StatePanel from '../../components/feedback/StatePanel';
import { formatDay, previousMonth, rangeProblem } from './dates';
import './AdminReports.css';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('en-US');

export default function InvoicePage() {
  const { user } = useAuth();
  const isAdmin = user?.account_type === 'admin';
  const [sponsors, setSponsors] = useState([]);
  const [form, setForm] = useState(() => ({ sponsor: '', ...previousMonth() }));
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Invoices | Good Driver Incentive Program';
  }, []);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    api
      .getAdminSponsorOrganizations()
      .then((companies) => {
        if (!cancelled) setSponsors(companies);
      })
      .catch(() => {
        if (!cancelled) setError('The sponsor list could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const generate = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.sponsor) {
      setError('Choose a sponsor organization.');
      return;
    }
    const problem = rangeProblem(form, { required: true });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      setInvoice(await api.getInvoice(form));
    } catch (requestError) {
      setInvoice(null);
      setError(requestError.message || 'The invoice could not be generated.');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <main className="reports-page">
        <StatePanel headingLevel={1} title="You don't have access to this page">
          <p>Only administrators can create invoices.</p>
        </StatePanel>
      </main>
    );
  }

  return (
    <div className="reports-page">
      <PageHeader
        title="Invoices"
        subtitle="Choose a sponsor and the billing period the invoice should cover"
      />
      <main className="reports-content">
        <form className="card reports-filters reports-no-print" onSubmit={generate} noValidate>
          <div className="reports-field">
            <label htmlFor="invoice-sponsor">Sponsor</label>
            <select id="invoice-sponsor" value={form.sponsor} onChange={update('sponsor')}>
              <option value="">Choose a sponsor…</option>
              {sponsors.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div className="reports-field">
            <label htmlFor="invoice-start">Billing period start</label>
            <input
              id="invoice-start"
              type="date"
              value={form.start}
              max={form.end || undefined}
              onChange={update('start')}
            />
          </div>
          <div className="reports-field">
            <label htmlFor="invoice-end">Billing period end</label>
            <input
              id="invoice-end"
              type="date"
              value={form.end}
              min={form.start || undefined}
              onChange={update('end')}
            />
          </div>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Generating…' : 'Generate invoice'}
          </button>
        </form>

        {error && (
          <p className="banner banner-error" role="alert">
            {error}
          </p>
        )}

        {invoice && (
          <article className="card invoice" aria-label="Invoice">
            <header className="invoice-head">
              <div>
                <h2>Invoice for {invoice.sponsor.name}</h2>
                <p>
                  Billing period: {formatDay(invoice.period.start)} to {formatDay(invoice.period.end)}
                </p>
                <p>Issued {formatDay(invoice.issued_on)}</p>
              </div>
              <button
                className="button reports-no-print"
                type="button"
                onClick={() => window.print()}
              >
                Print
              </button>
            </header>

            {invoice.lines.length === 0 ? (
              <p>No points were awarded during this billing period.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Driver</th>
                    <th scope="col" className="reports-number">
                      Points awarded
                    </th>
                    <th scope="col" className="reports-number">
                      Points removed
                    </th>
                    <th scope="col" className="reports-number">
                      Transactions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.username}>
                      <td>
                        {line.driver} <span className="reports-muted">@{line.username}</span>
                      </td>
                      <td className="reports-number">{count.format(line.points_awarded)}</td>
                      <td className="reports-number">{count.format(line.points_removed)}</td>
                      <td className="reports-number">{count.format(line.transactions)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="reports-number">{count.format(invoice.totals.points_awarded)}</td>
                    <td className="reports-number">{count.format(invoice.totals.points_removed)}</td>
                    <td className="reports-number">{count.format(invoice.totals.transactions)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            <p className="invoice-due">
              Amount due <strong>{money.format(Number(invoice.totals.amount_due))}</strong>
            </p>
            <p className="reports-muted">
              {invoice.basis} Rate: {count.format(invoice.points_per_dollar)} points per dollar.
            </p>
          </article>
        )}
      </main>
    </div>
  );
}
