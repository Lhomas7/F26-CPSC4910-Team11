import AssetFrame from '../AssetFrame';
import './Sky.css';

/** Puffy cloud. `drifting` bobs it gently side to side. */
export function Cloud({ drifting = true, ...frame }) {
  return (
    <AssetFrame name="cloud" modifiers={[drifting && 'drifting']} {...frame}>
      <span className="asset-cloud-puffs" />
    </AssetFrame>
  );
}

/** Sun with slowly turning rays. */
export function Sun(frame) {
  return (
    <AssetFrame name="sun" {...frame}>
      <span className="asset-sun-rays" />
      <span className="asset-sun-disc" />
    </AssetFrame>
  );
}

/** Crescent moon. */
export function Moon(frame) {
  return (
    <AssetFrame name="moon" {...frame}>
      <span className="asset-moon-disc" />
    </AssetFrame>
  );
}
