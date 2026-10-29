import { useEffect, useState } from 'react';

import PageHeader from '../../../app/PageHeader';
import StatePanel from '../../../components/feedback/StatePanel';
import CatalogAccessPanel from '../components/CatalogAccessPanel';
import CatalogPagination from '../components/CatalogPagination';
import CatalogSkeleton from '../components/CatalogSkeleton';
import ProductCard from '../components/ProductCard';
import ProductGrid from '../components/ProductGrid';
import useCatalogPage from '../hooks/useCatalogPage';
import useCatalogPagination from '../hooks/useCatalogPagination';
import '../Catalog.css';

const numbers = new Intl.NumberFormat('en-US');

export default function DriverCatalogPage() {
  const { page, changePage, recoverPage } = useCatalogPagination();
  const { data, setData, status, error: loadError, reload } = useCatalogPage(page, recoverPage);
  const [accessError, setAccessError] = useState(null);
  const error = accessError || loadError;
  const denied = [401, 403, 409].includes(error?.status);
  const busy = status === 'loading' && !denied;
  const visible = denied ? null : data;
  // A denied session must not resurrect old products/balance when a later
  // request clears the transient hook error. A new effective identity remounts
  // this page; ordinary refresh failures retain only this identity's data.
  useEffect(() => {
    if ([401, 403, 409].includes(loadError?.status)) {
      setAccessError(loadError);
      setData(null);
    }
  }, [loadError, setData]);
  const stale = Boolean(visible && (busy || error || visible.page !== page));
  const configured = visible?.pricing?.status === 'configured';
  const balanceValid = Number.isSafeInteger(visible?.point_balance);

  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle={
          <span
            className="catalog-header-subtitle"
            title={visible ? `${visible.sponsor.name}’s reward catalog` : undefined}
          >
            {visible
              ? `${visible.sponsor.name}’s reward catalog`
              : busy
                ? 'Loading your catalog'
                : 'Your sponsor’s reward catalog'}
          </span>
        }
      />
      <main className="catalog-content" aria-busy={busy}>
        {visible && (
          <p className="banner">
            {configured
              ? 'Redeeming rewards isn’t available yet. You can browse the catalog and see what each reward costs.'
              : 'Point pricing is not configured, so point costs aren’t available yet. Redeeming rewards isn’t available yet either.'}
          </p>
        )}
        {visible?.recovered && (
          <p className="banner" role="status">
            That page doesn&apos;t exist. Showing page 1.
          </p>
        )}
        {denied ? (
          <CatalogAccessPanel error={error} />
        ) : (
          error &&
          (visible ? (
            <div className="banner banner-error catalog-refresh-error" role="alert">
              <div>
                <strong>Catalog couldn&apos;t be refreshed</strong>
                <p>Previously loaded products, costs, and your point balance may be out of date.</p>
              </div>
              <button className="button" type="button" disabled={busy} onClick={reload}>
                Try again
              </button>
            </div>
          ) : (
            <StatePanel tone="error" title="Catalog couldn’t be loaded">
              <p>{error.message || 'Try again in a moment.'}</p>
              <button className="button" type="button" onClick={reload}>
                Try again
              </button>
            </StatePanel>
          ))
        )}
        {!visible && busy && <CatalogSkeleton showBalance />}
        {visible && (
          <>
            <section
              className="stat stat-highlight catalog-balance"
              aria-label="Your point balance"
            >
              <span className="stat-label">Your point balance</span>
              <strong className="stat-value">
                {balanceValid ? numbers.format(visible.point_balance) : 'Unavailable'}
              </strong>
              <small className="stat-note">
                {configured
                  ? `Catalog rate: ${numbers.format(visible.pricing.points_per_dollar)} points per $1`
                  : 'Point pricing is not configured'}
              </small>
              {stale && <span className="catalog-balance-stale">May be out of date</span>}
            </section>
            <div className="catalog-toolbar">
              <p className="catalog-count">
                {visible.count} {visible.count === 1 ? 'product' : 'products'}
              </p>
              {/* A real read-only refresh action lets Drivers update a balance
                  changed elsewhere without reloading the entire application. */}
              <button className="button" type="button" disabled={busy} onClick={reload}>
                {busy ? 'Refreshing…' : 'Refresh catalog'}
              </button>
            </div>
            {busy && (
              <p className="sr-only" role="status">
                Loading catalog page
              </p>
            )}
            {visible.results.length ? (
              <section aria-labelledby="catalog-rewards-heading">
                <h2 className="sr-only" id="catalog-rewards-heading">
                  Rewards
                </h2>
                <ProductGrid label="Rewards">
                  {visible.results.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      viewer="driver"
                      pricing={visible.pricing}
                      pointBalance={visible.point_balance}
                    />
                  ))}
                </ProductGrid>
              </section>
            ) : (
              <StatePanel title="No rewards yet">
                <p>Your sponsor hasn’t added any rewards to its catalog yet.</p>
              </StatePanel>
            )}
            <CatalogPagination
              count={visible.count}
              page={visible.page}
              resultCount={visible.results.length}
              next={visible.next}
              previous={visible.previous}
              busy={busy || Boolean(error)}
              onPage={changePage}
            />
          </>
        )}
      </main>
    </>
  );
}
