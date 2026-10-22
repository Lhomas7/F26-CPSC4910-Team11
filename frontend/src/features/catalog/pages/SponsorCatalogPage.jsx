import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import PageHeader from '../../../app/PageHeader';
import StatePanel from '../../../components/feedback/StatePanel';
import { PlusIcon } from '../../../components/primitives/Icons';
import CatalogPagination from '../components/CatalogPagination';
import AvailabilityControl from '../components/AvailabilityControl';
import ProductCard from '../components/ProductCard';
import SponsorProductFooter from '../components/SponsorProductFooter';
import ProductGrid from '../components/ProductGrid';
import useCatalogPage from '../hooks/useCatalogPage';
import useCatalogPagination from '../hooks/useCatalogPagination';
import CatalogSkeleton from '../components/CatalogSkeleton';
import { withConfirmedAvailability } from '../utils/availability';
import '../Catalog.css';

export default function SponsorCatalogPage({ identity }) {
  const location = useLocation();
  const navigate = useNavigate();
  const noticeRef = useRef(null);
  const [createdNotice, setCreatedNotice] = useState(() => {
    const notice = location.state?.catalogCreated;
    return notice && notice.identity === identity && Number.isSafeInteger(notice.id) && typeof notice.name === 'string' ? notice : null;
  });
  useEffect(() => {
    if (!location.state?.catalogCreated) return;
    // Consume this identity-bound notice once so Back cannot replay it after
    // returning from another form or account. Keep unrelated location state.
    const next = { ...location.state };
    delete next.catalogCreated;
    navigate(location.pathname + location.search, { replace: true, state: Object.keys(next).length ? next : null });
  }, [location.state, location.pathname, location.search, navigate]);
  useEffect(() => { if (createdNotice) noticeRef.current?.focus(); }, [createdNotice]);
  const { page, changePage, recoverPage } = useCatalogPagination();
  const { data, status, error: loadError, reload } = useCatalogPage(page, recoverPage);
  const [accessError, setAccessError] = useState(null);
  const [availability, setAvailability] = useState({ confirmed: {}, announcement: '' });
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const onSaved = useCallback((updated) => {
    if (!active.current) return;
    setAvailability((current) => {
      const previous = current.confirmed[updated.id];
      const confirmed = withConfirmedAvailability(previous || updated, updated);
      if (previous && confirmed === previous) return current;
      return {
        confirmed: { ...current.confirmed, [updated.id]: confirmed },
        announcement: `${updated.name} is now ${confirmed.is_available ? 'available' : 'unavailable'}.`,
      };
    });
  }, []);
  const onAccessError = useCallback((failure) => {
    if (active.current) setAccessError(failure);
  }, []);
  useEffect(() => {
    // Do not leave a previous "now available" announcement behind after a
    // fresh read may have confirmed a different value from another Sponsor.
    setAvailability((current) => current.announcement ? { ...current, announcement: '' } : current);
  }, [data]);
  const error = accessError || loadError;
  const busy = status === 'loading';
  // A denied/ended session is not a transient refresh failure. Never keep its
  // previously loaded organization data visible while auth state catches up.
  const denied = [401, 403, 409].includes(error?.status);
  const visible = denied ? null : data;

  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle={visible ? `${visible.sponsor.name}’s reward catalog` : busy ? 'Loading your catalog' : 'Your organization’s reward catalog'}
      />
      <main className="catalog-content" aria-busy={busy}>
        {createdNotice && !denied && (
          <div className="banner banner-success catalog-created-notice" role="status" ref={noticeRef} tabIndex={-1}>
            <div>
              <strong>“{createdNotice.name}” was added.</strong>
              <p>Products are listed alphabetically, so it may be on a later page.</p>
            </div>
            <div className="catalog-toolbar-actions">
              <Link className="button" to="/catalog/new">Add another product</Link>
              <button className="button" type="button" onClick={() => setCreatedNotice(null)}>Dismiss</button>
            </div>
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {denied ? '' : availability.announcement}
        </p>
        {!denied && (visible || busy) && (
          <p className="banner">
            {visible?.pricing?.status === 'configured' ? '' : 'Point pricing isn’t configured yet. '}
            Product prices are shown in US dollars. Reward redemption is not available.
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
              <div className="catalog-toolbar-actions">
                <button className="button" type="button" disabled={busy} onClick={reload}>
                  {busy ? 'Refreshing…' : 'Refresh catalog'}
                </button>
                <Link className="button button-primary" to="/catalog/new"><PlusIcon size={16} />Add product</Link>
              </div>
            </div>
            {busy && <p className="sr-only" role="status">Loading catalog page</p>}
            {visible.results.length ? (
              <section aria-labelledby="catalog-products-heading">
                <h2 className="sr-only" id="catalog-products-heading">Products</h2>
                <ProductGrid>
                  {visible.results.map((record) => {
                    const product = withConfirmedAvailability(record, availability.confirmed[record.id]);
                    return (
                      <ProductCard key={product.id} product={product} pricing={visible.pricing} footer={
                        <SponsorProductFooter product={product}>
                        <AvailabilityControl
                          product={product} catalogVersion={data} disabled={busy}
                          onSaved={onSaved} onAccessError={onAccessError} onRefresh={reload}
                        />
                        </SponsorProductFooter>
                      } />
                    );
                  })}
                </ProductGrid>
              </section>
            ) : (
              <StatePanel title="No products yet">
                <p>Products added by your organization will appear here.</p>
                <Link className="button button-primary" to="/catalog/new"><PlusIcon size={16} />Add product</Link>
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
