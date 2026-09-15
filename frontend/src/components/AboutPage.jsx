import { useEffect, useState } from 'react';

import { API_URL } from '../config/api';

function formatReleaseDate(releaseDate) {
  return new Date(`${releaseDate}T00:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function AboutPage() {
  const [release, setRelease] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_URL}/about/`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('About information could not be loaded.');
        }
        return response.json();
      })
      .then(setRelease)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(true);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="about-page">
      <section className="about-hero" aria-labelledby="about-title">
        <p className="eyebrow">About the program</p>
        {error ? (
          <p role="alert" className="status-message">
            About information is temporarily unavailable. Please try again later.
          </p>
        ) : !release ? (
          <p role="status" className="status-message">
            Loading release information...
          </p>
        ) : (
          <>
            <h1 id="about-title">{release.product_name}</h1>
            <p className="product-description">{release.product_description}</p>
            <dl className="release-details" aria-label="Current release details">
              <div>
                <dt>Team</dt>
                <dd>Team {release.team_number}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{release.version_number}</dd>
              </div>
              <div>
                <dt>Release date</dt>
                <dd>
                  <time dateTime={release.release_date}>
                    {formatReleaseDate(release.release_date)}
                  </time>
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
