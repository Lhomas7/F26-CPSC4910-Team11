import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
//   loses a wheel and burns until `wrecked` goes back to false. The fire
//   spreads along the truck until a fire truck shows up (after --rescue-delay) from whichever
//   end of the road is further from the wreck and hoses it down.
export default function RoadTruck({ mode = 'loop', arrived = false, crashKey = 0, wrecked = false, className = '' }) {
  const [crashed, setCrashed] = useState(false);
  const [rescue, setRescue] = useState(null);
  const laneRef = useRef(null);
  const truckRef = useRef(null);

  useEffect(() => {
    if (!crashKey) return undefined;
    setCrashed(true);
    const timer = setTimeout(() => setCrashed(false), CRASH_MS);
    return () => clearTimeout(timer);
  }, [crashKey]);

  // Measure where the truck was when it wrecked (its `left` is mid-animation)
  // so the fire truck can come from the far side and stop just short of it.
  useLayoutEffect(() => {
    if (!wrecked) {
      setRescue(null);
      return;
    }
    const laneWidth = laneRef.current.clientWidth;
    const { offsetLeft, offsetWidth } = truckRef.current;
    setRescue({
      side: offsetLeft + offsetWidth / 2 < laneWidth / 2 ? 'right' : 'left',
      wreckLeft: offsetLeft,
      wreckRight: offsetLeft + offsetWidth,
    });
  }, [wrecked]);

  const truckClasses = [
    'road-truck',
    `road-truck-${mode}`,
    mode === 'arrive' && arrived ? 'road-truck-arrived' : '',
    wrecked ? 'road-truck-wrecked' : '',
    crashed && !wrecked ? 'road-truck-crashed' : '',
    rescue?.side === 'right' ? 'road-truck-rescue-right' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`road-lane ${className}`.trim()} aria-hidden="true" ref={laneRef}>
      <div className={truckClasses} ref={truckRef}>
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
            <span className="road-truck-flame road-truck-flame-b" />
            <span className="road-truck-flame road-truck-flame-c" />
            <span className="road-truck-flame road-truck-flame-d" />
            <span className="road-truck-plume road-truck-plume-a" />
            <span className="road-truck-plume road-truck-plume-b" />
            <span className="road-truck-plume road-truck-plume-c" />
          </>
        )}
      </div>
      {rescue && (
        <div
          className={`road-rescue road-rescue-from-${rescue.side}`}
          style={{ '--wreck-left': `${rescue.wreckLeft}px`, '--wreck-right': `${rescue.wreckRight}px` }}
        >
          <span className="road-rescue-vehicle">
            <span className="road-rescue-body" />
            <span className="road-rescue-ladder" />
            <span className="road-rescue-cab" />
            <span className="road-rescue-window" />
            <span className="road-rescue-lights" />
            <span className="road-rescue-wheel road-rescue-wheel-a" />
            <span className="road-rescue-wheel road-rescue-wheel-b" />
            <span className="road-rescue-spray" />
          </span>
        </div>
      )}
    </div>
  );
}
