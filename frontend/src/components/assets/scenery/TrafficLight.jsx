import AssetFrame from '../AssetFrame';
import './TrafficLight.css';

/**
 * Traffic signal. state: "cycle" (green, yellow, red on a loop; set
 * --cycle-length to change the 8s loop) or a fixed "red", "yellow" or "green".
 */
export default function TrafficLight({ state = 'cycle', ...frame }) {
  return (
    <AssetFrame name="traffic-light" modifiers={[`signal-state-${state}`]} {...frame}>
      <span className="asset-signal-pole" />
      <span className="asset-signal-housing" />
      <span className="asset-signal-lamp asset-signal-red" />
      <span className="asset-signal-lamp asset-signal-yellow" />
      <span className="asset-signal-lamp asset-signal-green" />
    </AssetFrame>
  );
}
