import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import BrandMark from '../../../components/branding/BrandMark';
import './LegalPage.css';

const EFFECTIVE_DATE = 'October 2, 2026';

function LegalPage({ title, summary, children }) {
  useEffect(() => {
    document.title = `${title} | Good Driver Incentive Program`;
  }, [title]);

  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" to="/" aria-label="Good Driver home">
          <BrandMark />
          <span>Good Driver</span>
        </Link>
        <Link className="legal-return" to="/login">
          Return to sign in
        </Link>
      </header>
      <main className="legal-document">
        <header className="legal-title">
          <p className="legal-eyebrow">Good Driver Incentive Program</p>
          <h1>{title}</h1>
          <p>{summary}</p>
          <p className="legal-effective">Effective date: {EFFECTIVE_DATE}</p>
        </header>
        <aside className="legal-course-notice">
          <strong>Course-project notice</strong>
          <p>
            This application is an educational software project. These terms and notices are
            provided for transparency and demonstration purposes and are not legal advice or a
            substitute for review by qualified counsel before any real-world deployment.
          </p>
        </aside>
        <div className="legal-content">{children}</div>
        <footer className="legal-footer">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Notice</Link>
          <Link to="/login">Sign in or create an account</Link>
        </footer>
      </main>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="Rules for accessing and using the Good Driver Incentive Program course application."
    >
      <section>
        <h2>1. Acceptance of these terms</h2>
        <p>
          By creating an account or using the application, you agree to these Terms of Service and
          acknowledge the <Link to="/privacy">Privacy Notice</Link>. If you do not agree, do not
          create an account or continue using the application.
        </p>
      </section>

      <section>
        <h2>2. Educational and demonstration use</h2>
        <p>
          The application was created by Team 11 as a senior computer-science project. It may be
          used for coursework, demonstrations, testing, and evaluation. It is not a production
          fleet-management, employment, financial, safety-monitoring, or emergency service. Features
          and stored demonstration data may change, become unavailable, or be reset.
        </p>
      </section>

      <section>
        <h2>3. Accounts and eligibility</h2>
        <ul>
          <li>Provide accurate information and keep account details current.</li>
          <li>Use only an account and role you are authorized to use.</li>
          <li>Protect your password, MFA methods, and backup codes.</li>
          <li>Notify a project or program administrator if you suspect unauthorized access.</li>
          <li>Do not share credentials or attempt to impersonate another participant.</li>
        </ul>
        <p>You are responsible for activity performed through your account.</p>
      </section>

      <section>
        <h2>4. Program roles and sponsor decisions</h2>
        <p>
          Drivers, sponsor representatives, and administrators have different permissions. Sponsor
          organizations are responsible for their program rules, driver relationships, point
          decisions, reward availability, and the accuracy of information they enter. Administrative
          access may include account management and clearly disclosed support or impersonation tools
          that create audit records.
        </p>
      </section>

      <section>
        <h2>5. Points, rewards, and program information</h2>
        <p>
          Unless an authorized sponsor expressly states otherwise, points and rewards displayed in
          this course application are demonstration records, have no cash value, are not
          transferable, and do not create a promise of payment, employment benefit, or product
          availability. Sponsors may correct errors and establish their own eligibility rules.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You may not:</p>
        <ul>
          <li>Use the application unlawfully or to harm, harass, or deceive another person.</li>
          <li>Access accounts, records, roles, or systems without authorization.</li>
          <li>Upload malicious code or interfere with availability or security controls.</li>
          <li>
            Probe, scrape, overload, reverse engineer, or bypass restrictions except as expressly
            authorized for coursework or security testing.
          </li>
          <li>Enter real sensitive information when sample or test information is sufficient.</li>
        </ul>
      </section>

      <section>
        <h2>7. Uploaded content</h2>
        <p>
          You retain responsibility for information and images you submit. You grant the project
          permission to store, display, and process that content only as needed to operate and
          demonstrate the application. Do not upload content you lack permission to use.
        </p>
      </section>

      <section>
        <h2>8. Suspension and removal</h2>
        <p>
          Project administrators may restrict, suspend, or remove accounts or content to protect the
          system, enforce these terms, correct test data, comply with course requirements, or
          respond to suspected misuse.
        </p>
      </section>

      <section>
        <h2>9. Availability and disclaimers</h2>
        <p>
          The application is provided “as is” and “as available” for educational purposes. To the
          extent permitted by applicable law, Team 11 makes no warranty that it will be
          uninterrupted, error-free, secure, or suitable for operational driving, employment, or
          financial decisions. Do not rely on it for emergencies or safety-critical decisions.
        </p>
      </section>

      <section>
        <h2>10. Limitation of responsibility</h2>
        <p>
          To the extent permitted by applicable law, the project team is not responsible for
          indirect, incidental, special, consequential, or lost-data damages arising from use of
          this educational application. Nothing in these terms excludes rights or responsibilities
          that cannot legally be excluded.
        </p>
      </section>

      <section>
        <h2>11. Changes and contact</h2>
        <p>
          These terms may be updated as the project changes. A revised effective date will be posted
          here. Questions should be directed to your sponsor organization, course project
          administrator, or Team 11 through the contact channel provided with the application.
        </p>
      </section>
    </LegalPage>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      summary="How the Good Driver Incentive Program course application handles information."
    >
      <section>
        <h2>1. Scope</h2>
        <p>
          This notice describes information handled by the Good Driver Incentive Program course
          application. It does not govern independent practices of a sponsor organization, school,
          communications provider, or other third party.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> name, username, email address, password hash,
            account role, status, and sponsor-organization relationship.
          </li>
          <li>
            <strong>Profile information:</strong> information you update and an optional profile
            image.
          </li>
          <li>
            <strong>Security information:</strong> login-attempt records, session and CSRF cookies,
            MFA preferences, encrypted authenticator secrets, hashed verification or backup codes,
            and an optional telephone number for SMS verification.
          </li>
          <li>
            <strong>Program information:</strong> driver enrollment status, sponsor relationships,
            notifications, and other incentive-program records entered as features are enabled.
          </li>
          <li>
            <strong>Administrative audit information:</strong> administrator and target accounts,
            role, timestamps, action type, and IP address for impersonation or support sessions.
          </li>
          <li>
            <strong>Technical information:</strong> information ordinarily sent with web requests,
            such as request time, browser-generated headers, and security-cookie data.
          </li>
        </ul>
        <p>
          Do not submit highly sensitive personal information that the application does not request.
        </p>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <ul>
          <li>Create, authenticate, secure, and administer accounts.</li>
          <li>Provide role-based driver, sponsor, and administrator features.</li>
          <li>Associate drivers with sponsor organizations and display program records.</li>
          <li>Deliver password-reset and MFA messages.</li>
          <li>Detect failed logins, investigate misuse, and maintain audit trails.</li>
          <li>Test, debug, demonstrate, and improve the course application.</li>
          <li>Meet course, security, and applicable legal requirements.</li>
        </ul>
      </section>

      <section>
        <h2>4. Cookies and local browser data</h2>
        <p>
          The application uses session and CSRF cookies needed for sign-in, security, and request
          validation. It does not currently use advertising cookies or third-party behavioral
          tracking. Blocking essential cookies may prevent authentication and other features from
          working.
        </p>
      </section>

      <section>
        <h2>5. When information may be shared</h2>
        <ul>
          <li>
            <strong>Within the program:</strong> authorized sponsors and administrators may see
            information required for their role.
          </li>
          <li>
            <strong>Service providers:</strong> hosting, database, email, or SMS providers may
            process information when those services are configured, including AWS-hosted
            infrastructure and Twilio for SMS delivery.
          </li>
          <li>
            <strong>Course personnel:</strong> instructors or evaluators may access the application
            and demonstration data for academic review and support.
          </li>
          <li>
            <strong>Safety and legal reasons:</strong> information may be disclosed when reasonably
            necessary to protect users or systems, investigate misuse, or comply with applicable
            law.
          </li>
        </ul>
        <p>
          The project does not currently sell personal information or use it for targeted
          advertising.
        </p>
      </section>

      <section>
        <h2>6. Retention</h2>
        <p>
          Information may be retained while an account or the course project remains active and
          afterward when reasonably needed for security, audit, backup, troubleshooting, academic,
          or legal purposes. This project does not yet maintain a guaranteed deletion schedule.
          Demonstration environments and databases may also be reset as part of development.
        </p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          The application uses measures such as password hashing, role-based access controls,
          security cookies, optional MFA, encrypted authenticator secrets, hashed one-time and
          backup codes, and administrative audit records. No system can guarantee absolute security.
          Use a unique password and promptly report suspected unauthorized access.
        </p>
      </section>

      <section>
        <h2>8. Your choices</h2>
        <ul>
          <li>Review and update available profile information from the Account page.</li>
          <li>Manage available MFA methods and regenerate backup codes.</li>
          <li>
            Ask a sponsor or project administrator about access, correction, or deletion of account
            information.
          </li>
          <li>Decline to create an account if you do not accept this notice.</li>
        </ul>
        <p>
          Some records may need to be retained for security, audit, course, or legal reasons, and
          deleting information may prevent continued use of the application.
        </p>
      </section>

      <section>
        <h2>9. Children’s privacy</h2>
        <p>
          This application is not directed to children under 13, and the project team does not
          knowingly seek personal information from children under 13. Contact a project
          administrator if you believe such information was submitted.
        </p>
      </section>

      <section>
        <h2>10. Changes and contact</h2>
        <p>
          This notice may be revised as features and practices change. Material changes should be
          reflected here with a new effective date. Privacy questions or requests should be sent to
          your sponsor organization, course project administrator, or Team 11 through the contact
          channel provided with the application.
        </p>
      </section>
    </LegalPage>
  );
}
