import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDrivers, getPointHistory } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import SelectMenu from '../../../components/forms/SelectMenu';
import useApiRequest from '../../../hooks/useApiRequest';
import PointHistoryList from '../components/PointHistoryList';
import '../Points.css';

/** Load drivers and point history together, with loading and error states. */
function usePointsData(historyFilter) {
  const { data, status, error, reload } = useApiRequest(useCallback(async () => {
    const [drivers, history] = await Promise.all([getDrivers(), getPointHistory(historyFilter)]);
    return { drivers, history };
  }, [historyFilter]));

  return {
    drivers: data?.drivers ?? null,
    // Hide the previous history while a different filter loads.
    history: status === 'ready' ? data.history : null,
    error: status === 'loading' || status === 'ready' ? null : error.message,
    reload,
  };
}

function LoadState({ error, onRetry }) {
  if (error) {
    return (
      <StatePanel tone="error" title="Points couldn't be loaded">
        <p>{error}</p>
        <button className="button" type="button" onClick={onRetry}>Try again</button>
      </StatePanel>
    );
  }
  return (
    <div aria-label="Loading points">
      <Skeleton className="points-skeleton" />
      <Skeleton className="points-skeleton points-skeleton-list" />
    </div>
  );
}

const ALL_HISTORY = {};

function DriverPoints() {
  const { drivers, history, error, reload } = usePointsData(ALL_HISTORY);
  const record = drivers?.[0];

  return (
    <>
      <PageHeader title="Points" subtitle="Your balance and every change to it" />
      <main className="points-content">
        {!history ? <LoadState error={error} onRetry={reload} /> : (
          <>
            <section className="card points-balance" aria-label="Point balance">
              <span>Current balance</span>
              <strong>{Number(record?.point_balance || 0).toLocaleString()} <small>pts</small></strong>
              <p>{record?.sponsor_name ? `Sponsored by ${record.sponsor_name}` : 'Not linked to a sponsor yet'}</p>
            </section>
            <section className="card points-card" aria-labelledby="points-history-heading">
              <h2 id="points-history-heading">History</h2>
              <PointHistoryList entries={history} emptyText="No point changes yet. Your sponsor's awards and deductions will appear here." />
            </section>
          </>
        )}
      </main>
    </>
  );
}

function SponsorPoints() {
  const [driverFilter, setDriverFilter] = useState('all');
  const historyFilter = useMemo(() => (driverFilter === 'all' ? ALL_HISTORY : { driver: driverFilter }), [driverFilter]);
  const { drivers, history, error, reload } = usePointsData(historyFilter);

  const selected = drivers?.find((driver) => String(driver.id) === driverFilter);
  const totalPoints = (drivers || []).reduce((sum, driver) => sum + Number(driver.point_balance || 0), 0);
  const options = useMemo(() => [
    { value: 'all', label: 'All drivers' },
    ...(drivers || []).map((driver) => ({ value: String(driver.id), label: driver.name })),
  ], [drivers]);

  return (
    <>
      <PageHeader title="Points" subtitle="Point changes across your drivers, with every reason" />
      <main className="points-content">
        {!drivers ? <LoadState error={error} onRetry={reload} /> : (
          <>
            <section className="card points-balance" aria-label="Point balance">
              <span>{selected ? `${selected.name}'s balance` : 'Points held by your drivers'}</span>
              <strong>{Number(selected ? selected.point_balance : totalPoints).toLocaleString()} <small>pts</small></strong>
              {selected ? (
                selected.status === 'approved'
                  ? <Link className="button button-primary" to={`/drivers/${selected.id}`}>Award or deduct points</Link>
                  : <p>Approve {selected.name} before awarding points.</p>
              ) : (
                <p>To award or deduct points, pick a driver or open them from the Drivers page.</p>
              )}
            </section>
            <section className="card points-card" aria-labelledby="points-history-heading">
              <div className="points-card-heading">
                <h2 id="points-history-heading">{selected ? `${selected.name}'s history` : 'Recent activity'}</h2>
                {drivers.length > 0 && (
                  <SelectMenu
                    className="points-driver-filter"
                    label="Show history for"
                    value={driverFilter}
                    options={options}
                    onChange={setDriverFilter}
                  />
                )}
              </div>
              {history ? (
                <PointHistoryList
                  entries={history}
                  showDriver={!selected}
                  linkDrivers
                  emptyText={drivers.length ? 'No point changes yet.' : 'Link a driver on the Drivers page to start awarding points.'}
                />
              ) : error ? <LoadState error={error} onRetry={reload} /> : <Skeleton className="points-skeleton points-skeleton-list" />}
            </section>
          </>
        )}
      </main>
    </>
  );
}

/** Drivers see their own balance and history; sponsors see their drivers'. */
export default function PointsPage() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = 'Points | Good Driver Incentive Program';
  }, []);

  return (
    <div className="points-page">
      {user?.account_type === 'sponsor' ? <SponsorPoints /> : <DriverPoints />}
    </div>
  );
}
