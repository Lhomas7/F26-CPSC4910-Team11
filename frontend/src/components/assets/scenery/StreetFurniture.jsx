import AssetFrame from '../AssetFrame';
import './StreetFurniture.css';

/** Street lamp. `lit` turns the bulb on and casts a pool of light. */
export function StreetLamp({ lit = false, ...frame }) {
  return (
    <AssetFrame name="street-lamp" modifiers={[lit && 'lamp-lit']} {...frame}>
      <span className="asset-lamp-glow" />
      <span className="asset-lamp-pole" />
      <span className="asset-lamp-base" />
      <span className="asset-lamp-arm" />
      <span className="asset-lamp-head" />
      <span className="asset-lamp-bulb" />
    </AssetFrame>
  );
}

/** Park bench. */
export function Bench(frame) {
  return (
    <AssetFrame name="bench" {...frame}>
      <span className="asset-bench-back" />
      <span className="asset-bench-seat" />
      <span className="asset-bench-leg asset-bench-leg-a" />
      <span className="asset-bench-leg asset-bench-leg-b" />
    </AssetFrame>
  );
}

/** Red fire hydrant. */
export function FireHydrant(frame) {
  return (
    <AssetFrame name="hydrant" {...frame}>
      <span className="asset-hydrant-cap" />
      <span className="asset-hydrant-body" />
      <span className="asset-hydrant-nozzle" />
      <span className="asset-hydrant-base" />
    </AssetFrame>
  );
}

/** Orange traffic cone. */
export function TrafficCone(frame) {
  return (
    <AssetFrame name="cone" {...frame}>
      <span className="asset-cone-body" />
      <span className="asset-cone-base" />
    </AssetFrame>
  );
}

/** Striped road-closed barrier with a blinking amber lamp. */
export function RoadBarrier({ blinking = true, ...frame }) {
  return (
    <AssetFrame name="barrier" modifiers={[blinking && 'barrier-blinking']} {...frame}>
      <span className="asset-barrier-lamp" />
      <span className="asset-barrier-leg asset-barrier-leg-a" />
      <span className="asset-barrier-leg asset-barrier-leg-b" />
      <span className="asset-barrier-board asset-barrier-board-a" />
      <span className="asset-barrier-board asset-barrier-board-b" />
    </AssetFrame>
  );
}
