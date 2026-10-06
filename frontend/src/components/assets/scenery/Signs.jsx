import AssetFrame from '../AssetFrame';
import './Signs.css';

function SignPost({ name, modifiers, frame, children }) {
  return (
    <AssetFrame name={name} modifiers={['sign', ...(modifiers || [])]} {...frame}>
      <span className="asset-sign-pole" />
      {children}
    </AssetFrame>
  );
}

/** Red octagonal STOP sign. */
export function StopSign(frame) {
  return (
    <SignPost name="stop-sign" frame={frame}>
      <span className="asset-stop-plate">STOP</span>
    </SignPost>
  );
}

/** Red-and-white YIELD triangle. */
export function YieldSign(frame) {
  return (
    <SignPost name="yield-sign" frame={frame}>
      <span className="asset-yield-plate" />
    </SignPost>
  );
}

/** White SPEED LIMIT sign showing `limit`. */
export function SpeedLimitSign({ limit = 25, ...frame }) {
  return (
    <SignPost name="speed-limit-sign" frame={frame}>
      <span className="asset-limit-plate">
        <span className="asset-limit-words">SPEED LIMIT</span>
        <span className="asset-limit-number">{limit}</span>
      </span>
    </SignPost>
  );
}

/**
 * Fluorescent school-zone sign. `active` flashes the amber beacons above it,
 * like during school hours when the lower limit applies.
 */
export function SchoolZoneSign({ active = false, ...frame }) {
  return (
    <SignPost name="school-zone-sign" modifiers={[active && 'zone-active']} frame={frame}>
      <span className="asset-zone-beacon asset-zone-beacon-a" />
      <span className="asset-zone-beacon asset-zone-beacon-b" />
      <span className="asset-zone-plate">
        <span className="asset-zone-kids" />
        <span className="asset-zone-words">SCHOOL</span>
      </span>
    </SignPost>
  );
}
