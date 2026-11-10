export const BEHAVIOR_KINDS = [
  { kind: 'good', title: 'Earns points', empty: 'No rewarded behaviors listed.' },
  { kind: 'bad', title: 'Costs points', empty: 'No penalized behaviors listed.' },
];

export function signedPoints(behavior) {
  const value = Number(behavior.point_value).toLocaleString();
  return behavior.kind === 'good' ? `+${value}` : `−${value}`;
}

/** A sponsor's example behaviors, split into those that earn and those that cost points. */
export default function BehaviorList({ behaviors, error, onRetry, sponsorName }) {
  if (error && !behaviors)
    return (
      <div className="points-behaviors" role="alert">
        <p className="points-behaviors-note">
          Example behaviors couldn&apos;t be loaded.{' '}
          <button className="button-link" type="button" onClick={onRetry}>
            Try again
          </button>
        </p>
      </div>
    );
  if (!behaviors) return null;

  return (
    <section className="points-behaviors" aria-labelledby="points-behaviors-heading">
      <h2 id="points-behaviors-heading">How points change</h2>
      {behaviors.length === 0 ? (
        <p className="points-behaviors-note">
          {sponsorName || 'Your sponsor'} hasn&apos;t listed example behaviors yet.
        </p>
      ) : (
        <div className="points-behavior-columns">
          {BEHAVIOR_KINDS.map(({ kind, title, empty }) => {
            const rows = behaviors.filter((behavior) => behavior.kind === kind);
            return (
              <section className={`points-behavior-group ${kind}`} key={kind} aria-label={title}>
                <h3>{title}</h3>
                {rows.length ? (
                  <ul>
                    {rows.map((behavior) => (
                      <li key={behavior.id}>
                        <span>{behavior.description}</span>
                        <span
                          className={`badge ${kind === 'good' ? 'badge-success' : 'badge-danger'}`}
                        >
                          {signedPoints(behavior)} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="points-behaviors-note">{empty}</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
