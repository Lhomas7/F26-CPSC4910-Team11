import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { getPurchase, getPurchases } from 'api/purchases';
import PageHeader from 'app/PageHeader';
import { useAuth } from 'auth/AuthContext';
import sessionIdentity from 'auth/sessionIdentity';
import StatePanel from 'components/feedback/StatePanel';
import useApiRequest from 'hooks/useApiRequest';
import './DriverPurchases.css';

const purchaseDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});
const pointFormat = new Intl.NumberFormat('en-US');

function PurchaseTime({ value }) {
  return <time dateTime={value}>{purchaseDate.format(new Date(value))}</time>;
}

function PurchaseStatus({ status }) {
  return (
    <span className="badge">{status === 'completed' ? 'Completed' : 'Status unavailable'}</span>
  );
}

function PurchaseRequestState({ status, reload, list = false }) {
  if (status === 'loading') return <p role="status">Loading {list ? 'purchases' : 'purchase'}…</p>;
  if (status === 'not-found') {
    return (
      <StatePanel title={list ? 'Page unavailable' : 'Purchase unavailable'}>
        <p>
          {list
            ? 'This page of purchases could not be found.'
            : 'This purchase could not be found.'}
        </p>
        {list && <Link to="/purchases">Go to the first page</Link>}
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

function PurchaseHistory({ page }) {
  const load = useCallback(() => getPurchases(page), [page]);
  const { data, status, reload } = useApiRequest(load);
  if (status !== 'ready') return <PurchaseRequestState status={status} reload={reload} list />;
  if (!data.results.length) {
    return (
      <StatePanel title="No purchases yet">
        <p>Your completed reward purchases will appear here.</p>
        <Link to="/catalog">Browse rewards</Link>
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
                  <Link to={`/purchases/${purchase.id}`}>
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
          {data.previous && <Link to={`?page=${page - 1}`}>Previous</Link>}
          <span>Page {page}</span>
          {data.next && <Link to={`?page=${page + 1}`}>Next</Link>}
        </nav>
      )}
    </>
  );
}

export function DriverPurchaseHistoryPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  return (
    <main className="purchases-page">
      <PageHeader title="Purchase history" subtitle="Review the rewards you’ve redeemed." />
      <PurchaseHistory key={`${sessionIdentity(user)}:${page}`} page={page} />
    </main>
  );
}

function PurchaseDetail({ id }) {
  const load = useCallback(() => getPurchase(id), [id]);
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
  return (
    <main className="purchases-page">
      <PageHeader
        title="Purchase details"
        breadcrumb={<Link to="/purchases">Purchase history</Link>}
      />
      {/^[1-9]\d*$/.test(purchaseId) ? (
        <PurchaseDetail key={`${sessionIdentity(user)}:${purchaseId}`} id={purchaseId} />
      ) : (
        <StatePanel title="Purchase unavailable">
          <p>This purchase could not be found.</p>
        </StatePanel>
      )}
    </main>
  );
}
