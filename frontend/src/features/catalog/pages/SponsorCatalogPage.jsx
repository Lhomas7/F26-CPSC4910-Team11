import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../../../app/PageHeader';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import CatalogPagination from '../components/CatalogPagination';
import ProductCard from '../components/ProductCard';
import ProductGrid from '../components/ProductGrid';
import useCatalogPage from '../hooks/useCatalogPage';
import '../Catalog.css';

function readPage(value) {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function CatalogSkeleton() {
  return (
    <div role="status" aria-label="Loading catalog">
      <span className="sr-only">Loading catalog</span>
      <Skeleton className="catalog-skeleton-toolbar" />
      <ul className="catalog-product-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <li className="card catalog-product-card" key={index}>
            <Skeleton className="catalog-skeleton-media" />
            <div className="catalog-product-body">
              <Skeleton className="catalog-skeleton-line" />
              <Skeleton className="catalog-skeleton-line" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SponsorCatalogPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = params.get('page');
  const page = readPage(rawPage);
  const changePage = useCallback((value, replace = false) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === 1) next.delete('page');
      else next.set('page', String(value));
      return next;
    }, { replace });
  }, [setParams]);
  const recoverPage = useCallback(() => changePage(1, true), [changePage]);
  const { data, status, error, reload } = useCatalogPage(page, recoverPage);
  const busy = status === 'loading';
  // A denied/ended session is not a transient refresh failure. Never keep its
  // previously loaded organization data visible while auth state catches up.
  const denied = [401, 403, 409].includes(error?.status);
  const visible = denied ? null : data;

  useEffect(() => {
    if (rawPage !== null && rawPage !== String(page)) changePage(page, true);
  }, [rawPage, page, changePage]);

  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle={visible ? `${visible.sponsor.name}’s reward catalog` : busy ? 'Loading your catalog' : 'Your organization’s reward catalog'}
      />
      <main className="catalog-content" aria-busy={busy}>
        {!denied && (visible || busy) && (
          <p className="banner">
            Point pricing isn&apos;t configured yet. Product prices are currently stored in US dollars. Reward redemption is not available.
          </p>
        )}
        {visible?.recovered && (
          <p className="banner" role="status">That page doesn&apos;t exist. Showing page 1.</p>
        )}
        {error && (
          visible ? (
            <div className="banner banner-error catalog-refresh-error" role="alert">
              <div>
                <strong>Catalog couldn&apos;t be refreshed</strong>
                <p>{error.message || 'Try again in a moment.'} Previously loaded products are still shown.</p>
              </div>
              <button className="button" type="button" onClick={reload}>Try again</button>
            </div>
          ) : (
            <StatePanel tone="error" title={denied ? 'Catalog access is unavailable' : 'Catalog couldn’t be loaded'}>
              <p>{error.message || 'Try again in a moment.'}</p>
              {!denied && <button className="button" type="button" onClick={reload}>Try again</button>}
            </StatePanel>
          )
        )}
        {!visible && busy && <CatalogSkeleton />}
        {visible && (
          <>
            <div className="catalog-toolbar">
              <p className="catalog-count">{visible.count} {visible.count === 1 ? 'product' : 'products'}</p>
              {/* A real reload action also makes background-refresh feedback
                  reachable before Add Product arrives in its own commit. */}
              <button className="button" type="button" disabled={busy} onClick={reload}>
                {busy ? 'Refreshing…' : 'Refresh catalog'}
              </button>
            </div>
            {busy && <p className="sr-only" role="status">Loading catalog page</p>}
            {visible.results.length ? (
              <section aria-labelledby="catalog-products-heading">
                <h2 className="sr-only" id="catalog-products-heading">Products</h2>
                <ProductGrid>
                  {visible.results.map((product) => <ProductCard key={product.id} product={product} />)}
                </ProductGrid>
              </section>
            ) : (
              <StatePanel title="No products yet">
                <p>Products added by your organization will appear here.</p>
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
