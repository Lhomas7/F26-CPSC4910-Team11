import AssetFrame, { SpeedLines, vehicleModifiers } from '../AssetFrame';
import './Buses.css';

/**
 * Yellow American school bus with a protruding hood. `stopArm` swings out the
 * red STOP arm and flashes the red warning lights, as when kids are getting on
 * or off (passing it then is a big points deduction).
 */
export function SchoolBus({ moving = false, speeding = false, crash, stopArm = false, ...frame }) {
  return (
    <AssetFrame name="school-bus" modifiers={[...vehicleModifiers({ moving, speeding, crash }), stopArm && 'stop-arm-out']} {...frame}>
      {speeding && <SpeedLines />}
      <span className="asset-sbus-body" />
      <span className="asset-sbus-hood" />
      <span className="asset-window asset-sbus-windows" />
      <span className="asset-window asset-sbus-windshield" />
      <span className="asset-sbus-door" />
      <span className="asset-sbus-stripes" />
      <span className="asset-sbus-flasher asset-sbus-flasher-a" />
      <span className="asset-sbus-flasher asset-sbus-flasher-b" />
      <span className="asset-sbus-stop-arm">STOP</span>
      <span className="asset-sbus-bumper" />
      <span className="asset-wheel asset-sbus-wheel-a" />
      <span className="asset-wheel asset-sbus-wheel-b" />
    </AssetFrame>
  );
}

/** American city transit bus: flat front, big windows, destination sign. */
export function CityBus({ moving = false, speeding = false, crash, ...frame }) {
  return (
    <AssetFrame name="city-bus" modifiers={vehicleModifiers({ moving, speeding, crash })} {...frame}>
      {speeding && <SpeedLines />}
      <span className="asset-cbus-roof" />
      <span className="asset-cbus-body" />
      <span className="asset-window asset-cbus-windows" />
      <span className="asset-cbus-band" />
      <span className="asset-window asset-cbus-windshield" />
      <span className="asset-cbus-sign" />
      <span className="asset-window asset-cbus-door" />
      <span className="asset-wheel asset-cbus-wheel-a" />
      <span className="asset-wheel asset-cbus-wheel-b" />
    </AssetFrame>
  );
}

/** Red London double-decker. */
export function DoubleDeckerBus({ moving = false, speeding = false, crash, ...frame }) {
  return (
    <AssetFrame name="double-decker" modifiers={vehicleModifiers({ moving, speeding, crash })} {...frame}>
      {speeding && <SpeedLines />}
      <span className="asset-dd-body" />
      <span className="asset-dd-board" />
      <span className="asset-window asset-dd-upper" />
      <span className="asset-window asset-dd-upper-front" />
      <span className="asset-dd-band" />
      <span className="asset-window asset-dd-lower" />
      <span className="asset-window asset-dd-front" />
      <span className="asset-window asset-dd-door" />
      <span className="asset-wheel asset-dd-wheel-a" />
      <span className="asset-wheel asset-dd-wheel-b" />
    </AssetFrame>
  );
}
