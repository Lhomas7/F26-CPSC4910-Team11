import AssetFrame, { SpeedLines, vehicleModifiers } from '../AssetFrame';
import './Ambulance.css';

// White box ambulance with a red cross and red/white lights.
export default function Ambulance({ moving = false, speeding = false, lights = true, ...frame }) {
  return (
    <AssetFrame name="ambulance" modifiers={vehicleModifiers({ moving, speeding, lights })} {...frame}>
      {speeding && <SpeedLines />}
      <span className="asset-amb-box" />
      <span className="asset-amb-cross" />
      <span className="asset-amb-cab" />
      <span className="asset-window asset-amb-window" />
      <span className="asset-lightbar asset-amb-lightbar" />
      <span className="asset-wheel asset-amb-wheel-a" />
      <span className="asset-wheel asset-amb-wheel-b" />
    </AssetFrame>
  );
}
