import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import PageHeader from '../../app/PageHeader';
import ProgramPerks from '../../components/branding/ProgramPerks';
import RoadTruck from '../../components/branding/RoadTruck';
import './WelcomePage.css';

export default function WelcomePage() {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const accountType = user?.account_type;

  useEffect(() => {
    document.title = 'Welcome | Good Driver Incentive Program';
  }, []);

  return (
    <div className="welcome-page">
      <PageHeader title="Welcome" subtitle="Good Driver Incentive Program — safe miles add up to real rewards" />

      <main className="welcome-content">
        <section className="welcome-hero" aria-labelledby="welcome-title">
          {signedIn ? (
            <h2 id="welcome-title">Welcome back, {user.name || user.username}</h2>
          ) : (
            <h2 id="welcome-title">Safe miles add up to real rewards.</h2>
          )}
          <p>
            Good Driver Incentive Program rewards truck drivers for driving well.
            Sponsors award points for the behaviors they want to encourage, drivers
            track their balance, and points are redeemed through each sponsor&apos;s
            reward catalog.
          </p>

          {!signedIn ? (
            <div className="welcome-cta">
              <Link className="welcome-button primary" to="/login">Sign in</Link>
              <Link className="welcome-button" to="/login?tab=register">Create an account</Link>
              <Link className="welcome-link" to="/about">About this app</Link>
            </div>
          ) : (
            <div className="welcome-cta">
              {accountType === 'sponsor' && (
                <Link className="welcome-button primary" to="/drivers">Go to drivers</Link>
              )}
              <Link
                className={`welcome-button ${accountType === 'sponsor' ? '' : 'primary'}`}
                to="/account"
              >
                My account
              </Link>
            </div>
          )}

          <ProgramPerks />

          <RoadTruck className="welcome-lane" />
        </section>
      </main>
    </div>
  );
}
