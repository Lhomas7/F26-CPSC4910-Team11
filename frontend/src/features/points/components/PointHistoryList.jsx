import { Link } from 'react-router-dom';

import '../Points.css';

export function formatPoints(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount).toLocaleString()}`;
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Point changes, newest first: the reason, when, who made it and the signed
 * amount. `showDriver` adds the driver's name (linked for sponsors), for lists
 * that mix several drivers.
 */
export default function PointHistoryList({ entries, showDriver = false, linkDrivers = false, emptyText = 'No point changes yet.' }) {
  if (!entries.length) return <p className="point-history-empty">{emptyText}</p>;

  return (
    <ol className="point-history">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div className="point-history-main">
            {showDriver && (
              <span className="point-history-driver">
                {linkDrivers ? <Link to={`/drivers/${entry.driver}`}>{entry.driver_name}</Link> : entry.driver_name}
              </span>
            )}
            <span className="point-history-reason">{entry.reason}</span>
            <span className="point-history-meta">
              <time dateTime={entry.changed_at}>{formatDate(entry.changed_at)}</time>
              {entry.changed_by_name && <> · by {entry.changed_by_name}</>}
            </span>
          </div>
          <strong className={`point-history-change ${entry.point_change < 0 ? 'negative' : 'positive'}`}>
            {formatPoints(entry.point_change)}
            <span className="sr-only"> points</span>
          </strong>
        </li>
      ))}
    </ol>
  );
}
