import { useEffect, useState } from 'react';

import { API_URL } from '../../api';
import RoadTruck from '../../components/RoadTruck';
import './AboutPage.css';

function formatReleaseDate(releaseDate) {
  return new Date(`${releaseDate}T00:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function AboutPage() {
  const [release, setRelease] = useState(null);
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

  return (
    <div className="about-layout">
      <header className="about-topbar">
        <h1>About</h1>
        <p>Product and release information</p>
      </header>

      <main className="about-content" aria-busy={status === 'loading'}>
        <p className="sr-only" role="status" aria-live="polite">
          {status === 'loading' ? 'Loading release information' : ''}
        </p>

        {status === 'error' && (
          <section className="state-panel state-panel-error" role="alert">
            <h2>Release information couldn&apos;t be loaded</h2>
            <p>The server didn&apos;t return the product and release details. Check your connection, then try again.</p>
            <button type="button" onClick={retry}>Try again</button>
          </section>
        )}

        {status === 'empty' && (
          <section className="state-panel">
            <h2>No release information yet</h2>
            <p>An administrator needs to add the product and release details in Django Admin before they can appear here.</p>
          </section>
        )}

        {(status === 'loading' || ready) && (
          <>
            <section className="road-hero" aria-labelledby="product-name">
              <h2 id="product-name">
                {ready ? release.product_name : <span className="skeleton skeleton-title">Loading</span>}
              </h2>
              <p>
                {ready ? release.product_description : (
                  <><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line skeleton-line-short" /></>
                )}
              </p>
              <ul className="release-facts" aria-label="Release summary">
                <li>Team <b>{ready ? release.team_number : <span className="skeleton">00</span>}</b></li>
                <li>Version <b>{ready ? release.version_number : <span className="skeleton">Loading</span>}</b></li>
                <li>Released <b>{ready ? formatReleaseDate(release.release_date) : <span className="skeleton">Loading date</span>}</b></li>
              </ul>
              <RoadTruck className="about-lane" mode="arrive" arrived={Boolean(ready)} />
            </section>

            <div className="about-grid">
              <section className="about-card" aria-labelledby="release-details-heading">
                <h3 id="release-details-heading">Release details {ready && <span className="current-badge">Current</span>}</h3>
                <dl className="detail-rows">
                  <div><dt>Product</dt><dd>{ready ? release.product_name : <span className="skeleton">Loading product</span>}</dd></div>
                  <div><dt>Version</dt><dd>{ready ? release.version_number : <span className="skeleton">Loading</span>}</dd></div>
                  <div><dt>Release date</dt><dd>{ready ? formatReleaseDate(release.release_date) : <span className="skeleton">Loading date</span>}</dd></div>
                  <div><dt>Team</dt><dd>{ready ? `Team ${release.team_number}` : <span className="skeleton">Loading team</span>}</dd></div>
                </dl>
              </section>

              <section className="about-card" aria-labelledby="points-heading">
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
