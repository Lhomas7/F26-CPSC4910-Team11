import Skeleton from '../../../components/feedback/Skeleton';

export default function CatalogSkeleton({ showBalance = false }) {
  return (
    <div role="status" aria-label="Loading catalog">
      <span className="sr-only">Loading catalog</span>
      {showBalance && <Skeleton className="catalog-skeleton-balance" />}
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
