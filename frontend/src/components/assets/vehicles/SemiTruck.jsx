import AssetFrame, { SpeedLines, vehicleModifiers } from '../AssetFrame';
import './SemiTruck.css';

// The Good Driver truck: white trailer, green cab with a window, lights,
// bumper and exhaust stack.
export default function SemiTruck({ moving = false, speeding = false, crash, ...frame }) {
  return (
    <AssetFrame
      name="semi-truck"
      modifiers={vehicleModifiers({ moving, speeding, crash })}
      {...frame}
    >
      {speeding && <SpeedLines />}
      <span className="asset-semi-exhaust" />
      <span className="asset-semi-trailer" />
      <span className="asset-semi-taillight" />
      <span className="asset-semi-cab" />
      <span className="asset-window asset-semi-window" />
      <span className="asset-semi-headlight" />
      <span className="asset-semi-bumper" />
      <span className="asset-wheel asset-semi-wheel-a" />
      <span className="asset-wheel asset-semi-wheel-b" />
      <span className="asset-wheel asset-semi-wheel-c" />
    </AssetFrame>
  );
}
