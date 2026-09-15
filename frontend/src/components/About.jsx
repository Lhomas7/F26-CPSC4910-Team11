import { useEffect, useState } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api';

export default function About() {
  const [about, setAbout] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/about/`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('About information could not be loaded.');
        return response.json();
      })
      .then(setAbout)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(true);
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="about-page">
      <section className="about-hero" aria-labelledby="about-title">
        <p className="eyebrow">About the program</p>
        <h1 id="about-title">{about?.product_name || 'Good Driver Incentive Program'}</h1>
        {error ? (
          <p role="alert" className="status-message">
            About information is temporarily unavailable. Please try again later.
          </p>
        ) : !about ? (
          <p role="status" className="status-message">Loading release information...</p>
        ) : (
          <>
            <p className="product-description">{about.product_description}</p>
            <dl className="release-details" aria-label="Current release details">
              <div>
                <dt>Team</dt>
                <dd>Team {about.team_number}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{about.version}</dd>
              </div>
              <div>
                <dt>Release date</dt>
                <dd>
                  <time dateTime={about.release_date}>
                    {new Date(`${about.release_date}T00:00:00`).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
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
