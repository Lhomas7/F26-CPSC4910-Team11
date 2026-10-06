import AssetFrame, { SpeedLines, vehicleModifiers } from '../AssetFrame';
import './FireTruck.css';

// Red engine with a ladder and light bar. `spraying` turns on a water arc
// from the ladder nozzle out in front of the cab; set --spray-delay and
// --spray-length on the asset (or an ancestor) to time and size it.
export default function FireTruck({ moving = false, speeding = false, crash, lights = true, spraying = false, ...frame }) {
  return (
    <AssetFrame name="fire-truck" modifiers={vehicleModifiers({ moving, speeding, crash, lights })} {...frame}>
      {speeding && <SpeedLines />}
      <span className="asset-fire-body" />
      <span className="asset-fire-ladder" />
      <span className="asset-fire-cab" />
      <span className="asset-window asset-fire-window" />
      <span className="asset-lightbar asset-fire-lightbar" />
      <span className="asset-wheel asset-fire-wheel-a" />
      <span className="asset-wheel asset-fire-wheel-b" />
      {spraying && <span className="asset-fire-spray" />}
    </AssetFrame>
  );
}
