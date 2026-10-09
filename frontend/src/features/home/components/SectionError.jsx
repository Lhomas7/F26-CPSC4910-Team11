export default function SectionError({ title, error, onRetry }) {
  return (
    <div className="home-section-error" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{error?.message || 'Try again in a moment.'}</p>
      </div>
      <button className="button" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
