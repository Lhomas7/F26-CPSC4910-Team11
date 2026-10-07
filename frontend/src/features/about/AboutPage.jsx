import { useEffect, useState } from 'react';

import { API_URL } from '../../api';
import PageHeader from '../../app/PageHeader';
import { useAuth } from '../../auth/AuthContext';
import RoadTruck from '../../components/branding/RoadTruck';
import Skeleton from '../../components/feedback/Skeleton';
import StatePanel from '../../components/feedback/StatePanel';
import AboutEditForm from './AboutEditForm';
import './AboutPage.css';

function formatReleaseDate(releaseDate) {
  return new Date(`${releaseDate}T00:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function AboutPage() {
  const { user } = useAuth() || {};
  const [release, setRelease] = useState(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('loading');
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setStatus('loading');
    fetch(`${API_URL}/about/`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }).then((response) => {
        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          throw new Error('About information could not be loaded.');
        }
        return response.json();
      })
      .then((data) => {
        setRelease(data);
        setStatus(data ? 'ready' : 'empty');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setStatus('error');
        }
      });

    return () => controller.abort();
  }, [requestNumber]);

  useEffect(() => {
    if (release) {
      document.title = `About | ${release.product_name}`;
    }
  }, [release]);

  const retry = () => setRequestNumber((value) => value + 1);

  const ready = status === 'ready' && release;
  // Admins can edit the release in place (the server only accepts edits from admins).
  const canEdit = ready && user?.account_type === 'admin' && !editing;

  return (
    <div className="about-layout">
      <PageHeader
        title="About"
        subtitle="Product and release information"
        actions={canEdit && (
          <button className="button" type="button" onClick={() => { setNotice(''); setEditing(true); }}>
            Edit release details
          </button>
        )}
      />

      <main className="about-content" aria-busy={status === 'loading'}>
        <p className="sr-only" role="status" aria-live="polite">
          {status === 'loading' ? 'Loading release information' : ''}
        </p>

        {status === 'error' && (
          <StatePanel className="about-state" tone="error" title="Release information couldn't be loaded">
            <p>The server didn&apos;t return the product and release details. Check your connection, then try again.</p>
            <button type="button" onClick={retry}>Try again</button>
          </StatePanel>
        )}

        {status === 'empty' && (
          <StatePanel className="about-state" title="No release information yet">
            <p>An administrator needs to add the product and release details in Django Admin before they can appear here.</p>
          </StatePanel>
        )}

        {notice && <p className="banner banner-success about-notice" role="status">{notice}</p>}

        {editing && ready && (
          <AboutEditForm
            release={release}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => {
              setRelease(saved);
              setEditing(false);
              setNotice('Release details saved.');
            }}
          />
        )}

        {(status === 'loading' || ready) && (
          <>
            <section className="road-hero" aria-labelledby="product-name">
              <h2 id="product-name">
                {ready ? release.product_name : <Skeleton className="about-skeleton skeleton-title">Loading</Skeleton>}
              </h2>
              <p>
                {ready ? release.product_description : (
                  <><Skeleton className="about-skeleton skeleton-line" /><Skeleton className="about-skeleton skeleton-line skeleton-line-short" /></>
                )}
              </p>
              <ul className="release-facts" aria-label="Release summary">
                <li>Team <b>{ready ? release.team_number : <Skeleton className="about-skeleton">00</Skeleton>}</b></li>
                <li>Version <b>{ready ? release.version_number : <Skeleton className="about-skeleton">Loading</Skeleton>}</b></li>
                <li>Released <b>{ready ? formatReleaseDate(release.release_date) : <Skeleton className="about-skeleton">Loading date</Skeleton>}</b></li>
              </ul>
              <RoadTruck className="about-lane" mode="arrive" arrived={Boolean(ready)} />
            </section>

            <div className="about-grid">
              <section className="card about-card" aria-labelledby="release-details-heading">
                <h3 id="release-details-heading">Release details {ready && <span className="badge badge-success">Current</span>}</h3>
                <dl className="detail-rows">
                  <div><dt>Product</dt><dd>{ready ? release.product_name : <Skeleton className="about-skeleton">Loading product</Skeleton>}</dd></div>
                  <div><dt>Version</dt><dd>{ready ? release.version_number : <Skeleton className="about-skeleton">Loading</Skeleton>}</dd></div>
                  <div><dt>Release date</dt><dd>{ready ? formatReleaseDate(release.release_date) : <Skeleton className="about-skeleton">Loading date</Skeleton>}</dd></div>
                  <div><dt>Team</dt><dd>{ready ? `Team ${release.team_number}` : <Skeleton className="about-skeleton">Loading team</Skeleton>}</dd></div>
                </dl>
              </section>

              <section className="card about-card" aria-labelledby="points-heading">
                <h3 id="points-heading">How points work</h3>
                <ol className="points-steps">
                  <li>Sponsors award points for safe driving.</li>
                  <li>Drivers track their point balance.</li>
                  <li>Points can be redeemed through sponsor reward catalogs as features become available.</li>
                </ol>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
