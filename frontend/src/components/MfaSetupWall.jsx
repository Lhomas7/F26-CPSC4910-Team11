import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import * as api from '../config/api';
import MfaPanel from './MfaPanel';
import './AccountPage.css';
import './MfaSetupWall.css';

const ACCOUNT_LABELS = { admin: 'administrator', sponsor: 'sponsor' };

export default function MfaSetupWall() {
  const { user, updateUser } = useAuth();
  const [mfa, setMfa] = useState(null);
  const roleLabel = ACCOUNT_LABELS[user?.account_type] || 'account';

  const refresh = useCallback(async () => {
    try {
      const data = await api.mfaStatus();
      const next = data.mfa;
      setMfa(next);
      if (next.enrolled && user) {
        updateUser({ ...user, mfa: next });
      }
    } catch {
      // Keep the current state; a later action will refresh again.
    }
  }, [updateUser, user]);

  useEffect(() => {
    api.mfaStatus()
      .then((data) => setMfa(data.mfa))
      .catch(() => setMfa({ required: true, enrolled: false, methods: [] }));
  }, []);

  if (mfa && mfa.enrolled) return null;

  return (
    <div className="mfa-wall">
      <header className="mfa-wall-heading">
        <h1>Finish setting up your {roleLabel} account</h1>
        <p>
          {`${roleLabel[0].toUpperCase()}${roleLabel.slice(1)}`} accounts require
          two-factor authentication. Set it up below before you can continue into
          the app.
        </p>
      </header>

      {mfa ? (
        <MfaPanel
          mfa={mfa}
          onRefreshed={refresh}
          hideRequiredBanner
          requiredText={`${roleLabel[0].toUpperCase()}${roleLabel.slice(1)} accounts require two-factor authentication.`}
        />
      ) : (
        <p>Loading your security settings…</p>
      )}
    </div>
  );
}