import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../auth/AuthContext';
import PageHeader from '../../../app/PageHeader';
import ProgramPerks from '../../../components/branding/ProgramPerks';
import RoadTruck from '../../../components/branding/RoadTruck';
import HomeDashboard from '../components/HomeDashboard';
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
      <PageHeader
        title={signedIn ? 'Home' : 'Welcome'}
        subtitle={
          signedIn
            ? {
                driver: 'Your program standing at a glance',
                sponsor: 'Your organization at a glance',
                admin: 'Account oversight at a glance',
              }[accountType]
            : 'Good Driver Incentive Program — safe miles add up to real rewards'
        }
      />

      {signedIn ? (
        <main className="home-content">
          <HomeDashboard accountType={accountType} user={user} />
        </main>
      ) : (
        <main className="welcome-content">
          <section className="welcome-hero" aria-labelledby="welcome-title">
            <h2 id="welcome-title">Safe miles add up to real rewards.</h2>
            <p>
              Good Driver Incentive Program rewards truck drivers for driving well. Sponsors award
              points for the behaviors they want to encourage, drivers track their balance, and
              points are redeemed through each sponsor&apos;s reward catalog.
            </p>
            <div className="welcome-cta">
              <Link className="button button-large button-primary" to="/login">
                Sign in
              </Link>
              <Link className="button button-large" to="/login?tab=register">
                Create an account
              </Link>
              <Link className="welcome-link" to="/about">
                About this app
              </Link>
            </div>
            <ProgramPerks />
            <RoadTruck className="welcome-lane" />
          </section>
        </main>
      )}
    </div>
  );
}
