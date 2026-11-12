import { useCallback, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import { getPurchase, getPurchases, getSponsorPurchase, getSponsorPurchases } from 'api/purchases';
import PageHeader from 'app/PageHeader';
import { useAuth } from 'auth/AuthContext';
import sessionIdentity from 'auth/sessionIdentity';
import StatePanel from 'components/feedback/StatePanel';
import useApiRequest from 'hooks/useApiRequest';
import './DriverPurchases.css';

const purchaseDateOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
};
const pointFormat = new Intl.NumberFormat('en-US');

function PurchaseTime({ value }) {
  return (
    <time dateTime={value}>{new Date(value).toLocaleString('en-US', purchaseDateOptions)}</time>
  );
}

function PurchaseStatus({ status }) {
  return (
    <span className="badge">{status === 'completed' ? 'Completed' : 'Status unavailable'}</span>
  );
}

function PurchaseRequestState({ status, reload, firstPage }) {
  const list = Boolean(firstPage);
  if (status === 'loading') return <p role="status">Loading {list ? 'purchases' : 'purchase'}…</p>;
  if (status === 'not-found') {
    return (
      <StatePanel title={list ? 'Page unavailable' : 'Purchase unavailable'}>
        <p>
          {list
            ? 'This page of purchases could not be found.'
            : 'This purchase could not be found.'}
        </p>
        {list && <Link to={firstPage}>Go to the first page</Link>}
      </StatePanel>
    );
  }
  if (status === 'forbidden') {
    return <StatePanel title="Purchase history is unavailable for this account" />;
  }
  return (
    <StatePanel title="Could not load purchase information" tone="error">
      <button className="button" type="button" onClick={reload}>
        Try again
      </button>
    </StatePanel>
  );
}

function PurchaseHistory({ page, load, basePath, filters = '', sponsor = false }) {
  const { search } = useLocation();
  const pageLink = (nextPage) => {
    const params = new URLSearchParams(filters);
    if (nextPage > 1) params.set('page', nextPage);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const { data, status, reload } = useApiRequest(load);
  if (status !== 'ready') {
    return <PurchaseRequestState status={status} reload={reload} firstPage={pageLink(1)} />;
  }
  if (!data.results.length) {
    return (
      <StatePanel title="No purchases yet">
        {sponsor ? (
          <p>No completed purchases match this driver and date range.</p>
        ) : (
          <>
            <p>Your completed reward purchases will appear here.</p>
            <Link to="/catalog">Browse rewards</Link>
          </>
        )}
      </StatePanel>
    );
  }

  return (
    <>
      <ul className="purchase-list" aria-label="Completed purchases">
        {data.results.map((purchase) => {
          const [firstItem, ...otherItems] = purchase.items;
          const itemSummary = otherItems.length ? ` and ${otherItems.length} more` : '';
          return (
            <li className="card purchase-card" key={purchase.id}>
              <div className="purchase-row">
                <h2>
                  <Link to={`${basePath}/${purchase.id}${sponsor ? search : ''}`}>
                    {firstItem
                      ? `${firstItem.product_name}${itemSummary}`
                      : `Purchase ${purchase.id}`}
                  </Link>
                </h2>
                <PurchaseStatus status={purchase.status} />
              </div>
              <div className="purchase-row">
                <PurchaseTime value={purchase.completed_at} />
                <strong>{pointFormat.format(purchase.total_points)} points</strong>
              </div>
            </li>
          );
        })}
      </ul>
      {(data.previous || data.next) && (
        <nav className="purchase-pagination" aria-label="Purchase history pages">
          {data.previous && <Link to={pageLink(page - 1)}>Previous</Link>}
          <span>Page {page}</span>
          {data.next && <Link to={pageLink(page + 1)}>Next</Link>}
        </nav>
      )}
    </>
  );
}

function purchasePageNumber(params) {
  const requestedPage = Number(params.get('page'));
  return Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
}

export function DriverPurchaseHistoryPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const page = purchasePageNumber(params);
  const load = useCallback(() => getPurchases(page), [page]);
  return (
    <main className="purchases-page">
      <PageHeader title="Purchase history" subtitle="Review the rewards you’ve redeemed." />
      <PurchaseHistory
        key={`${sessionIdentity(user)}:${page}`}
        page={page}
        load={load}
        basePath="/purchases"
      />
    </main>
  );
}

function PurchaseDetail({ load }) {
  const { data, status, reload } = useApiRequest(load);
  if (status !== 'ready') return <PurchaseRequestState status={status} reload={reload} />;

  return (
    <>
      <section className="card purchase-card" aria-labelledby="purchase-summary">
        <h2 id="purchase-summary">Summary</h2>
        <dl className="purchase-summary">
          <dt>Reference</dt>
          <dd>{data.reference}</dd>
          <dt>Placed</dt>
          <dd>
            <PurchaseTime value={data.completed_at} />
          </dd>
          <dt>Status</dt>
          <dd>
            <PurchaseStatus status={data.status} />
          </dd>
          <dt>Points spent</dt>
          <dd>{pointFormat.format(data.total_points)}</dd>
        </dl>
      </section>
      <section className="card purchase-card" aria-labelledby="purchase-items">
        <h2 id="purchase-items">Items</h2>
        {data.items.length ? (
          <ul className="purchase-list purchase-items">
            {data.items.map((item) => (
              <li className="purchase-row" key={item.id}>
                <strong>{item.product_name}</strong>
                <span>
                  {item.quantity} × {pointFormat.format(item.unit_points)} points
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Item details are unavailable for this purchase.</p>
        )}
      </section>
    </>
  );
}

export function DriverPurchaseDetailPage() {
  const { user } = useAuth();
  const { purchaseId } = useParams();
  const load = useCallback(() => getPurchase(purchaseId), [purchaseId]);
  return (
    <main className="purchases-page">
      <PageHeader
        title="Purchase details"
        breadcrumb={<Link to="/purchases">Purchase history</Link>}
      />
      {/^[1-9]\d*$/.test(purchaseId) ? (
        <PurchaseDetail key={`${sessionIdentity(user)}:${purchaseId}`} load={load} />
      ) : (
        <StatePanel title="Purchase unavailable">
          <p>This purchase could not be found.</p>
        </StatePanel>
      )}
    </main>
  );
}

function localDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utc = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) return null;
  return new Date(`${value}T00:00:00`);
}

function purchaseDateBounds(from, through) {
  const start = localDate(from);
  const end = localDate(through);
  if ((from && !start) || (through && !end) || (from && through && from > through)) return null;
  // Use the next local midnight as an exclusive boundary, including across DST changes.
  if (end) {
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
  }
  return { from: start?.toISOString(), before: end?.toISOString() };
}

function PurchaseDateFilters({ from, through, apply }) {
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextFrom = data.get('from');
    const nextThrough = data.get('through');
    if (!purchaseDateBounds(nextFrom, nextThrough)) {
      setError('Enter valid dates with the end date on or after the start date.');
      return;
    }
    setError('');
    const next = new URLSearchParams();
    if (nextFrom) next.set('from', nextFrom);
    if (nextThrough) next.set('through', nextThrough);
    apply(next);
  }

  return (
    <form className="card purchase-card" onSubmit={handleSubmit} aria-label="Filter purchases">
      <div className="purchase-filters">
        <label>
          From <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          Through <input type="date" name="through" defaultValue={through} />
        </label>
        <button className="button button-primary" type="submit">
          Apply filters
        </button>
        <button
          className="button"
          type="button"
          onClick={(event) => {
            event.currentTarget.form.reset();
            setError('');
            apply(new URLSearchParams());
          }}
        >
          Clear filters
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function SponsorPurchaseHistoryPage() {
  const { user } = useAuth();
  const { driverId } = useParams();
  const [params, setParams] = useSearchParams();
  const page = purchasePageNumber(params);
  const from = params.get('from') || '';
  const through = params.get('through') || '';
  const bounds = purchaseDateBounds(from, through);
  const start = bounds?.from;
  const end = bounds?.before;
  const load = useCallback(
    () => getSponsorPurchases(driverId, page, { from: start, before: end }),
    [driverId, page, start, end],
  );
  const filters = new URLSearchParams(params);
  filters.delete('page');
  const basePath = `/drivers/${driverId}/purchases`;
  return (
    <main className="purchases-page">
      <PageHeader
        title="Driver purchase history"
        subtitle="Review purchases made under your organization. Dates use your local time zone."
        breadcrumb={<Link to={`/drivers/${driverId}`}>Driver details</Link>}
      />
      <PurchaseDateFilters
        key={`${sessionIdentity(user)}:${driverId}:${from}:${through}`}
        from={from}
        through={through}
        apply={setParams}
      />
      {bounds && /^[1-9]\d*$/.test(driverId) ? (
        <PurchaseHistory
          key={`${sessionIdentity(user)}:${driverId}:${page}:${filters}`}
          page={page}
          load={load}
          basePath={basePath}
          filters={filters}
          sponsor
        />
      ) : (
        <StatePanel title={bounds ? 'Driver unavailable' : 'Invalid date range'} tone="error" />
      )}
    </main>
  );
}

export function SponsorPurchaseDetailPage() {
  const { user } = useAuth();
  const { driverId, purchaseId } = useParams();
  const { search } = useLocation();
  const load = useCallback(() => getSponsorPurchase(driverId, purchaseId), [driverId, purchaseId]);
  return (
    <main className="purchases-page">
      <PageHeader
        title="Driver purchase details"
        breadcrumb={
          <Link to={`/drivers/${driverId}/purchases${search}`}>Driver purchase history</Link>
        }
      />
      {/^[1-9]\d*$/.test(driverId) && /^[1-9]\d*$/.test(purchaseId) ? (
        <PurchaseDetail key={`${sessionIdentity(user)}:${driverId}:${purchaseId}`} load={load} />
      ) : (
        <StatePanel title="Purchase unavailable" />
      )}
    </main>
  );
}
