import { useCallback } from 'react';

import { getOrganization } from 'api';
import PageHeader from 'app/PageHeader';
import { useAuth } from 'auth/AuthContext';
import StatePanel from 'components/feedback/StatePanel';
import useApiRequest from 'hooks/useApiRequest';
import OrganizationForm from '../components/OrganizationForm';
import TeamPanel from '../components/TeamPanel';
import '../Organization.css';

function OrganizationDetails({ organization }) {
  const rows = [
    ['Website', organization.website, (value) => <a href={value}>{value}</a>],
    ['Email', organization.contact_email, (value) => <a href={`mailto:${value}`}>{value}</a>],
    ['Phone', organization.contact_phone, (value) => <a href={`tel:${value}`}>{value}</a>],
  ].filter(([, value]) => value);

  return (
    <section className="card organization-card" aria-labelledby="sponsor-details-heading">
      <h2 id="sponsor-details-heading">{organization.name}</h2>
      {organization.description ? (
        <p className="organization-description">{organization.description}</p>
      ) : (
        <p>Your sponsor hasn&apos;t added a description yet.</p>
      )}
      {rows.length > 0 && (
        <dl className="organization-contact">
          {rows.map(([label, value, render]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{render(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export default function OrganizationPage() {
  const { user } = useAuth();
  const isSponsor = user?.account_type === 'sponsor';
  const {
    data: organization,
    status,
    error,
    reload,
    setData,
  } = useApiRequest(useCallback(() => getOrganization(), []));

  const title = isSponsor ? 'Organization' : 'Sponsor info';
  const subtitle = isSponsor
    ? 'Keep your details current and manage your sponsor team'
    : 'Learn more about the sponsor you are shopping with';

  return (
    <div className="organization-page">
      <PageHeader title={title} subtitle={subtitle} />
      <main className="organization-content">
        {status === 'loading' && !organization && <p>Loading…</p>}
        {status === 'not-found' && (
          <StatePanel title="No sponsor yet">
            <p>{error.message}</p>
          </StatePanel>
        )}
        {(status === 'error' || status === 'forbidden') && (
          <StatePanel tone="error" title="Organization details couldn't be loaded">
            <p>{error.message}</p>
            <button className="button button-primary" type="button" onClick={reload}>
              Try again
            </button>
          </StatePanel>
        )}
        {organization && isSponsor && (
          <>
            <OrganizationForm organization={organization} onSaved={setData} />
            <TeamPanel />
          </>
        )}
        {organization && !isSponsor && <OrganizationDetails organization={organization} />}
      </main>
    </div>
  );
}
