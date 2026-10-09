const ROLE_LABELS = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Administrator' };

export default function WelcomeHeader({ user, organization }) {
  return (
    <section className="home-welcome" aria-labelledby="home-welcome-name">
      <h2 id="home-welcome-name">Welcome back, {user.name || user.username}</h2>
      <div className="home-welcome-meta">
        <span className="badge badge-neutral">{ROLE_LABELS[user.account_type]}</span>
        {organization && <span className="home-welcome-organization">{organization}</span>}
      </div>
    </section>
  );
}
