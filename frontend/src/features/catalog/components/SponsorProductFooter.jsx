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
      {children}
      {validUpdated && (
        <time className="catalog-product-updated" dateTime={product.updated_at}>
          Updated {updatedFormat.format(updated)}
        </time>
      )}
    </>
  );
}
