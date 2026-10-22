import './CatalogPagination.css';

export const CATALOG_PAGE_SIZE = 25;

export default function CatalogPagination({ count, page, resultCount, next, previous, busy, onPage }) {
  const pages = Math.max(1, Math.ceil(count / CATALOG_PAGE_SIZE));
  if (pages === 1 && page === 1) return null;
  const first = count ? (page - 1) * CATALOG_PAGE_SIZE + 1 : 0;
  const last = count ? Math.min(first + resultCount - 1, count) : 0;

  return (
    <nav className="catalog-pagination" aria-label="Catalog pages">
      <p className="catalog-pagination-range">Showing {first}–{last} of {count} products</p>
      <div className="catalog-pagination-controls">
        <button className="button" type="button" disabled={busy || !previous} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="catalog-pagination-position" aria-live="polite" aria-atomic="true">
          Page {page} of {pages}
        </span>
        <button className="button" type="button" disabled={busy || !next} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
