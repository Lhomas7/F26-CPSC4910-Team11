import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { getDrivers, getPointHistory } from '../../../api';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import Skeleton from '../../../components/feedback/Skeleton';
import StatePanel from '../../../components/feedback/StatePanel';
import SelectMenu from '../../../components/forms/SelectMenu';
import Avatar from '../../../components/primitives/Avatar';
import { ArrowRightIcon } from '../../../components/primitives/Icons';
import useApiRequest from '../../../hooks/useApiRequest';
import PointHistoryList from '../components/PointHistoryList';
import '../Points.css';

const PAGE_SIZE = 25;

function InlineError({ title, error, onRetry }) {
  return (
    <div className="points-inline-error" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{error?.message || 'Try again in a moment.'}</p>
      </div>
      <button className="button" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function HistoryCard({
  entries,
  error,
  loading,
  onRetry,
  title,
  emptyText,
  showDriver = false,
  showSponsor = false,
  limit,
  onShowMore,
}) {
  const hasEntries = Boolean(entries?.length);
  const canShowMore = hasEntries && entries.length >= limit;

  return (
    <section className="card points-card" aria-labelledby="points-history-heading">
      <div className="points-card-heading">
        <div>
          <h2 id="points-history-heading">{title}</h2>
          <p>Newest first. Times are shown in your local time zone.</p>
        </div>
      </div>
      <div className="points-card-body" aria-busy={loading}>
        {error && !hasEntries ? (
          <InlineError title="Point activity couldn't be loaded" error={error} onRetry={onRetry} />
        ) : entries ? (
          <>
            <PointHistoryList
              detailStyle
              entries={entries}
              emptyText={emptyText}
              linkDrivers={showDriver}
              showDriver={showDriver}
              showSponsor={showSponsor}
            />
            {error && (
              <InlineError
                title="Point activity couldn't be refreshed"
                error={error}
                onRetry={onRetry}
              />
            )}
            {canShowMore ? (
              <div className="points-more">
                <button className="button" disabled={loading} type="button" onClick={onShowMore}>
                  {loading ? 'Loading…' : `Show ${PAGE_SIZE} more`}
                </button>
              </div>
            ) : hasEntries ? (
              <p className="points-all-shown">
                All {entries.length.toLocaleString()} point{' '}
                {entries.length === 1 ? 'change' : 'changes'} shown.
              </p>
            ) : null}
          </>
        ) : (
          <Skeleton className="points-skeleton points-skeleton-list" />
        )}
      </div>
    </section>
  );
}

function DriverStanding({ record, error, loading, onRetry }) {
  if (error && !record)
    return (
      <section className="card points-standing">
        <InlineError title="Your balance couldn't be loaded" error={error} onRetry={onRetry} />
      </section>
    );

  if (!record)
    return (
      <Skeleton className="points-skeleton points-skeleton-standing" aria-label="Loading balance" />
    );

  const approved = record.status === 'approved';
  const linked = Boolean(record.sponsor_name);
  let guidance = 'Your sponsor can award or deduct points and each change appears below.';
  if (!linked) guidance = 'A sponsor must link your account before you can participate.';
  else if (!approved)
    guidance = `${record.sponsor_name} must approve your enrollment before your points can change.`;

  return (
    <section className="card points-standing" aria-label="Program standing" aria-busy={loading}>
      <div className="points-standing-balance">
        <span>Current balance</span>
        <strong>
          {Number(record.point_balance || 0).toLocaleString()} <small>pts</small>
        </strong>
      </div>
      <dl className="points-standing-facts">
        <div>
          <dt>Sponsor organization</dt>
          <dd className={linked ? '' : 'points-unassigned'}>
            {record.sponsor_name || 'Not linked to a sponsor'}
          </dd>
        </div>
        <div>
          <dt>Enrollment status</dt>
          <dd>
            <span
              className={`badge badge-dot ${approved && linked ? 'badge-success' : 'badge-warning'}`}
            >
              {approved && linked ? 'Approved' : linked ? 'Pending approval' : 'Not enrolled'}
            </span>
          </dd>
        </div>
      </dl>
      <p className="points-standing-guidance">{guidance}</p>
    </section>
  );
}

function DriverPoints() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const driversRequest = useApiRequest(useCallback(() => getDrivers(), []));
  const historyRequest = useApiRequest(useCallback(() => getPointHistory({ limit }), [limit]));
  const record = driversRequest.data?.[0];

  return (
    <>
      <PageHeader title="Points" subtitle="Your balance and every change to it" />
      <main className="points-content">
        <DriverStanding
          error={driversRequest.error}
          loading={driversRequest.status === 'loading'}
          onRetry={driversRequest.reload}
          record={record}
        />
        <HistoryCard
          emptyText="No point changes yet. Your sponsor's awards and deductions will appear here."
          entries={historyRequest.data}
          error={historyRequest.error}
          limit={limit}
          loading={historyRequest.status === 'loading'}
          onRetry={historyRequest.reload}
          onShowMore={() => setLimit((current) => current + PAGE_SIZE)}
          showSponsor
          title="Point history"
        />
      </main>
    </>
  );
}

function SponsorOverview({ drivers }) {
  const counts = drivers.reduce(
    (result, driver) => ({
      total: result.total + 1,
      approved: result.approved + (driver.status === 'approved' ? 1 : 0),
      pending: result.pending + (driver.status === 'pending' ? 1 : 0),
      points: result.points + Number(driver.point_balance || 0),
    }),
    { total: 0, approved: 0, pending: 0, points: 0 },
  );

  return (
    <section className="stat-grid points-stat-grid" aria-label="Organization point overview">
      <div className="stat stat-highlight">
        <span className="stat-label">Points held by drivers</span>
        <strong className="stat-value">{counts.points.toLocaleString()}</strong>
        <small className="stat-note">Total of every current balance</small>
      </div>
      <div className="stat">
        <span className="stat-label">Linked drivers</span>
        <strong className="stat-value">{counts.total}</strong>
        <small className="stat-note">All enrollment states</small>
      </div>
      <div className="stat">
        <span className="stat-label">Approved</span>
        <strong className="stat-value">{counts.approved}</strong>
        <small className="stat-note">Eligible for point adjustments</small>
      </div>
      <div className="stat stat-warning">
        <span className="stat-label">Pending</span>
        <strong className="stat-value">{counts.pending}</strong>
        <small className="stat-note">Waiting for review</small>
      </div>
    </section>
  );
}

function SelectedDriverCard({ driver }) {
  const approved = driver.status === 'approved';
  return (
    <section
      className={`card points-scope-driver ${driver.status}`}
      aria-labelledby="scope-driver-name"
    >
      <div className="points-scope-person">
        <Avatar className="points-scope-avatar" name={driver.name} src={driver.profile_picture} />
        <div>
          <h2 id="scope-driver-name">{driver.name}</h2>
          <p>@{driver.username}</p>
          <span className={`badge badge-dot ${approved ? 'badge-success' : 'badge-warning'}`}>
            {approved ? 'Approved' : 'Pending approval'}
          </span>
        </div>
      </div>
      <div className="points-scope-balance">
        <span>Current balance</span>
        <strong>
          {Number(driver.point_balance || 0).toLocaleString()} <small>pts</small>
        </strong>
      </div>
      <div className="points-scope-action">
        <Link className="button button-primary button-large" to={`/drivers/${driver.id}`}>
          {approved ? 'Award or deduct points' : 'Review enrollment'}
          <ArrowRightIcon size={15} />
        </Link>
        <p>
          {approved
            ? "Point adjustments are made on the driver's page."
            : `Approve ${driver.name} on their driver page before awarding points.`}
        </p>
      </div>
    </section>
  );
}

function SponsorPoints() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [scopeNotice, setScopeNotice] = useState('');
  const driverParam = searchParams.get('driver');
  const driversRequest = useApiRequest(useCallback(() => getDrivers(), []));
  const selected = driversRequest.data?.find((driver) => String(driver.id) === driverParam);
  const selectedId = selected ? String(selected.id) : 'all';
  const historyRequest = useApiRequest(
    useCallback(
      () =>
        getPointHistory({
          ...(selectedId === 'all' ? {} : { driver: selectedId }),
          limit,
        }),
      [limit, selectedId],
    ),
  );

  useEffect(() => {
    if (!driversRequest.data || !driverParam || selected) return;
    setSearchParams({}, { replace: true });
    setScopeNotice('That driver is not in your organization. Showing all drivers instead.');
  }, [driverParam, driversRequest.data, selected, setSearchParams]);

  const options = useMemo(
    () => [
      { value: 'all', label: 'All drivers' },
      ...(driversRequest.data || []).map((driver) => ({
        value: String(driver.id),
        label: driver.name,
        searchText: `${driver.name} ${driver.username || ''}`,
        meta: `@${driver.username}${driver.status === 'pending' ? ' · Pending' : ''}`,
      })),
    ],
    [driversRequest.data],
  );

  const changeScope = (value) => {
    setLimit(PAGE_SIZE);
    setScopeNotice('');
    setSearchParams(value === 'all' ? {} : { driver: value });
  };

  const drivers = driversRequest.data;
  const title = selected
    ? `${selected.name}'s point history`
    : 'Recent activity across your organization';
  const emptyText = selected
    ? `No point changes for ${selected.name} under your organization yet.`
    : drivers?.some((driver) => driver.status === 'approved')
      ? 'No point changes yet. Awards and deductions you make will appear here.'
      : 'No point changes yet. Approve a driver to start awarding points.';

  return (
    <>
      <PageHeader
        title="Points"
        subtitle={
          selected ? `Point activity for ${selected.name}` : 'Point activity across your drivers'
        }
      />
      <main className="points-content points-sponsor-content">
        {scopeNotice && (
          <p className="banner banner-warning points-scope-notice" role="status">
            {scopeNotice}
          </p>
        )}

        {driversRequest.status === 'loading' && !drivers ? (
          <>
            <Skeleton className="points-skeleton points-skeleton-scope" />
            <div className="stat-grid points-stat-grid" aria-hidden="true">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton className="points-skeleton points-skeleton-stat" key={item} />
              ))}
            </div>
          </>
        ) : driversRequest.error && !drivers ? (
          <StatePanel tone="error" title="Your drivers couldn't be loaded">
            <p>{driversRequest.error.message}</p>
            <button className="button button-primary" type="button" onClick={driversRequest.reload}>
              Try again
            </button>
          </StatePanel>
        ) : drivers?.length === 0 ? (
          <StatePanel title="No drivers linked yet">
            <p>Link a driver before reviewing enrollment or awarding points.</p>
            <Link className="button button-primary" to="/drivers">
              Open Drivers
            </Link>
          </StatePanel>
        ) : (
          <>
            <section className="card points-scope-bar" aria-labelledby="points-scope-label">
              <strong id="points-scope-label">Viewing</strong>
              <SelectMenu
                searchable
                className="points-scope-select"
                emptyText="No matching drivers"
                label="Viewing point activity for"
                options={options}
                searchPlaceholder="Search name or username"
                value={selectedId}
                onChange={changeScope}
              />
              {selected && (
                <button
                  className="button points-scope-clear"
                  type="button"
                  onClick={() => changeScope('all')}
                >
                  Clear
                </button>
              )}
            </section>
            {selected ? (
              <SelectedDriverCard driver={selected} />
            ) : (
              <SponsorOverview drivers={drivers} />
            )}
          </>
        )}

        {drivers?.length !== 0 && (
          <HistoryCard
            emptyText={emptyText}
            entries={historyRequest.data}
            error={historyRequest.error}
            limit={limit}
            loading={historyRequest.status === 'loading'}
            onRetry={historyRequest.reload}
            onShowMore={() => setLimit((current) => current + PAGE_SIZE)}
            showDriver={!selected}
            title={title}
          />
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
