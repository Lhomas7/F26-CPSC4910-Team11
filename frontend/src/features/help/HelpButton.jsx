import { useState } from 'react';

import { getHelpContacts } from 'api';
import Modal from 'components/feedback/Modal';
import { HelpIcon } from 'components/primitives/Icons';
import useApiRequest from 'hooks/useApiRequest';
import './Help.css';

function ContactLinks({ email, phone }) {
  return (
    <dl className="help-contact">
      {email && (
        <div>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${email}`}>{email}</a>
          </dd>
        </div>
      )}
      {phone && (
        <div>
          <dt>Phone</dt>
          <dd>
            <a href={`tel:${phone}`}>{phone}</a>
          </dd>
        </div>
      )}
    </dl>
  );
}

function SponsorContact({ sponsor }) {
  const reachable = sponsor.email || sponsor.phone;
  return (
    <li className="help-card">
      <h4>
        {sponsor.name}
        {sponsor.active && <span className="help-badge">Current sponsor</span>}
      </h4>
      {sponsor.contact_name && <p>Ask for {sponsor.contact_name}</p>}
      {sponsor.hours && <p className="help-muted">{sponsor.hours}</p>}
      {reachable ? (
        <ContactLinks email={sponsor.email} phone={sponsor.phone} />
      ) : (
        <p className="help-muted">This sponsor hasn&apos;t added contact details yet.</p>
      )}
    </li>
  );
}

function HelpContacts({ contacts }) {
  const { admin, sponsors } = contacts;
  return (
    <>
      <section aria-labelledby="help-sponsors-heading">
        <h3 id="help-sponsors-heading">Your sponsor</h3>
        <p className="help-muted">For questions about points, rewards, or your orders.</p>
        {sponsors.length > 0 ? (
          <ul className="help-list">
            {sponsors.map((sponsor) => (
              <SponsorContact key={sponsor.id} sponsor={sponsor} />
            ))}
          </ul>
        ) : (
          <p>You aren&apos;t linked to a sponsor yet.</p>
        )}
      </section>
      <section aria-labelledby="help-admin-heading">
        <h3 id="help-admin-heading">Site support</h3>
        <p className="help-muted">For account or site problems your sponsor can&apos;t fix.</p>
        {admin.email || admin.phone ? (
          <ContactLinks email={admin.email} phone={admin.phone} />
        ) : (
          <p>Site support hasn&apos;t added contact details yet.</p>
        )}
      </section>
    </>
  );
}

function HelpDialog({ onClose }) {
  const { data, status, error, reload } = useApiRequest(getHelpContacts);
  return (
    <Modal
      title="Get help"
      onClose={onClose}
      className="help-dialog"
      actions={
        <button className="button button-large" type="button" onClick={onClose} data-autofocus>
          Close
        </button>
      }
    >
      {status === 'loading' && <p role="status">Loading contacts…</p>}
      {status === 'ready' && <HelpContacts contacts={data} />}
      {status !== 'loading' && status !== 'ready' && (
        <div className="banner banner-error" role="alert">
          <span>{error?.message || 'Contacts could not be loaded.'}</span>
          <button className="button" type="button" onClick={reload}>
            Try again
          </button>
        </div>
      )}
    </Modal>
  );
}

/** A floating button that shows who a driver can contact when they need help. */
export default function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="help-button-shell">
      <button
        className="help-button"
        type="button"
        aria-label="Get help"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Get help"
        onClick={() => setOpen(true)}
      >
        <HelpIcon size={20} />
      </button>
      {open && <HelpDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
