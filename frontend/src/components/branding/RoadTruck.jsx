import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Fire, FireTruck, Impact, SemiTruck, Smoke, Wheel } from '../assets';
import './RoadTruck.css';

// Matches the length of the SemiTruck's crash="tip" animation (assets.css).
export const CRASH_MS = 1800;

// Decorative road lane with a truck driving along it. Everything drawn here
// is an asset; this component only decides what happens when.
//
// mode="loop" drives back and forth forever; mode="arrive" sits at the start
// until `arrived` is true, then drives to the end once.
// Easter eggs:
// - each time `crashKey` changes to a new non-zero value the truck crashes
//   where it is, then carries on;
// - while `wrecked` is true (the server is down) the truck flips onto its roof,
//   loses a wheel and burns until `wrecked` goes back to false. The fire
//   spreads along the truck until a fire truck shows up (after --rescue-delay)
//   from whichever end of the road is further from the wreck and hoses it down.
export default function RoadTruck({
  mode = 'loop',
  arrived = false,
  crashKey = 0,
  wrecked = false,
  className = '',
}) {
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
    // State markers (styling and tests hook onto these).
    wrecked ? 'road-truck-wrecked' : '',
    crashed && !wrecked ? 'road-truck-crashed' : '',
    crashed || wrecked ? 'road-truck-stopped' : '',
  ]
    .filter(Boolean)
    .join(' ');

  let crash;
  if (wrecked) crash = 'flip';
  else if (crashed) crash = 'tip';

  return (
    <div className={`road-lane ${className}`.trim()} aria-hidden="true" ref={laneRef}>
      <div className={truckClasses} ref={truckRef}>
        <SemiTruck className="road-truck-vehicle" crash={crash} />
        {crash && <Impact className={`road-truck-impact road-truck-impact-${crash}`} />}
        {crash === 'tip' && (
          <>
            <Smoke className="road-truck-smoke road-truck-smoke-a" />
            <Smoke className="road-truck-smoke road-truck-smoke-b" />
          </>
        )}
        {crash === 'flip' && (
          <>
            {/* The wheel rolls away from the side the fire truck comes from. */}
            <Wheel
              className={`road-truck-loose-wheel road-truck-loose-wheel-${rescue?.side === 'right' ? 'back' : 'front'}`}
              rolling={rescue?.side === 'right' ? 'left' : 'right'}
            />
            <Fire className="road-truck-fire" />
          </>
        )}
      </div>
      {rescue && (
        <div
          className={`road-rescue road-rescue-from-${rescue.side}`}
          style={{
            '--wreck-left': `${rescue.wreckLeft}px`,
            '--wreck-right': `${rescue.wreckRight}px`,
          }}
        >
          <FireTruck facing={rescue.side === 'right' ? 'left' : 'right'} spraying />
        </div>
      )}
    </div>
  );
}
