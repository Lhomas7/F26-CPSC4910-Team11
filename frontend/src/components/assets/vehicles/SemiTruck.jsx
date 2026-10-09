import AssetFrame, { SpeedLines, vehicleModifiers } from '../AssetFrame';
import './SemiTruck.css';

// The Good Driver truck: a white box trailer with the green brand stripe,
// pulled by a green cab with a roof fairing, a chrome exhaust stack, a fuel
// tank, lights and a bumper. Parts are listed back to front so later ones draw
// on top. The overall box (2.875em x 1.125em) is fixed: RoadTruck's lane
// animation, crash poses, fire and rescue placement are all built around it.
export default function SemiTruck({ moving = false, speeding = false, crash, ...frame }) {
  return (
    <AssetFrame
      name="semi-truck"
      modifiers={vehicleModifiers({ moving, speeding, crash })}
      {...frame}
    >
      {speeding && <SpeedLines />}

      {/* Trailer */}
      <span className="asset-semi-trailer" />
      <span className="asset-semi-trailer-stripe" />
      <span className="asset-semi-trailer-door" />
      <span className="asset-semi-taillight" />
      <span className="asset-semi-marker" />
      <span className="asset-semi-landing-gear" />

      {/* Tractor */}
      <span className="asset-semi-fairing" />
      <span className="asset-semi-cab" />
      <span className="asset-semi-cab-door" />
      <span className="asset-window asset-semi-window" />
      <span className="asset-semi-grille" />
      <span className="asset-semi-headlight" />
      <span className="asset-semi-bumper" />
      <span className="asset-semi-exhaust" />
      <span className="asset-semi-exhaust-cap" />
      <span className="asset-semi-fuel-tank" />

      {/* Wheels: tandem trailer axle, tractor drive axle, steer axle */}
      <span className="asset-wheel asset-semi-wheel asset-semi-wheel-a" />
      <span className="asset-wheel asset-semi-wheel asset-semi-wheel-a2" />
      <span className="asset-wheel asset-semi-wheel asset-semi-wheel-b" />
      <span className="asset-wheel asset-semi-wheel asset-semi-wheel-c" />
    </AssetFrame>
  );
}
