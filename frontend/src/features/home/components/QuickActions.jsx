export default function QuickActions({ children }) {
  return (
    <section className="card home-quick-actions" aria-labelledby="home-actions-heading">
      <h3 id="home-actions-heading">Quick actions</h3>
      <p>Where to go next.</p>
      <div className="home-quick-actions-row">{children}</div>
    </section>
  );
}
