const updatedFormat = new Intl.DateTimeFormat('en-US', {
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export default function SponsorProductFooter({ product, children }) {
  const updated = product.updated_at ? new Date(product.updated_at) : null;
  const validUpdated = updated && !Number.isNaN(updated.getTime());
  return (
    <>
      {product.provider === 'fake_store' && <p className="catalog-provider-status">
        Fake Store API demo product · Inventory unverified
        {product.provider_data_stale && <strong> · Price may be out of date</strong>}
      </p>}
      {children}
      {product.provider === 'fake_store' && product.last_synced_at &&
        !Number.isNaN(Date.parse(product.last_synced_at)) &&
        <time className="catalog-product-updated" dateTime={product.last_synced_at}>
          Provider checked {updatedFormat.format(new Date(product.last_synced_at))}
        </time>}
      {validUpdated && (
        <time className="catalog-product-updated" dateTime={product.updated_at}>
          Updated {updatedFormat.format(updated)}
        </time>
      )}
    </>
  );
}
