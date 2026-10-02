import { useEffect, useState } from 'react';

import './RoadTruck.css';

// Matches the length of the road-truck-crash animation in RoadTruck.css.
export const CRASH_MS = 1800;

// Decorative road lane with a truck driving along it.
// mode="loop" drives back and forth forever; mode="arrive" sits at the start
// until `arrived` is true, then drives to the end once.
// Easter eggs:
// - each time `crashKey` changes to a new non-zero value the truck crashes
//   where it is, then carries on;
// - while `wrecked` is true (the server is down) the truck flips onto its roof,
//   loses a wheel and burns until `wrecked` goes back to false.
export default function RoadTruck({ mode = 'loop', arrived = false, crashKey = 0, wrecked = false, className = '' }) {
  const [crashed, setCrashed] = useState(false);

  useEffect(() => {
    if (!crashKey) return undefined;
    setCrashed(true);
    const timer = setTimeout(() => setCrashed(false), CRASH_MS);
    return () => clearTimeout(timer);
  }, [crashKey]);

  const truckClasses = [
    'road-truck',
    `road-truck-${mode}`,
    mode === 'arrive' && arrived ? 'road-truck-arrived' : '',
    wrecked ? 'road-truck-wrecked' : '',
    crashed && !wrecked ? 'road-truck-crashed' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`road-lane ${className}`.trim()} aria-hidden="true">
      <div className={truckClasses}>
        <span className="road-truck-body">
          <span className="road-truck-trailer" />
          <span className="road-truck-cab" />
          <span className="road-truck-wheel road-truck-wheel-a" />
          <span className="road-truck-wheel road-truck-wheel-b" />
          <span className="road-truck-wheel road-truck-wheel-c" />
        </span>
        {(crashed || wrecked) && <span className="road-truck-impact" />}
        {crashed && !wrecked && (
          <>
            <span className="road-truck-smoke road-truck-smoke-a" />
            <span className="road-truck-smoke road-truck-smoke-b" />
          </>
        )}
        {wrecked && (
          <>
            <span className="road-truck-loose-wheel" />
            <span className="road-truck-flame" />
            <span className="road-truck-plume road-truck-plume-a" />
            <span className="road-truck-plume road-truck-plume-b" />
            <span className="road-truck-plume road-truck-plume-c" />
          </>
        )}
      </div>
    </div>
  );
}
