import AssetFrame from '../AssetFrame';
import './Places.css';

/** Gas station: price board, canopy over two pumps, and a small shop. `lit` turns the lights on. */
export function GasStation({ lit = false, ...frame }) {
  return (
    <AssetFrame name="gas-station" modifiers={[lit && 'place-lit']} {...frame}>
      <span className="asset-gas-board-pole" />
      <span className="asset-gas-board" />
      <span className="asset-gas-pillar asset-gas-pillar-a" />
      <span className="asset-gas-pillar asset-gas-pillar-b" />
      <span className="asset-gas-canopy" />
      <span className="asset-gas-island" />
      <span className="asset-gas-pump asset-gas-pump-a" />
      <span className="asset-gas-pump asset-gas-pump-b" />
      <span className="asset-gas-shop" />
      <span className="asset-gas-shop-window" />
      <span className="asset-gas-shop-door" />
    </AssetFrame>
  );
}

/** Brick school with a clock tower, a SCHOOL sign and a waving flag. `lit` lights the windows. */
export function School({ lit = false, ...frame }) {
  return (
    <AssetFrame name="school" modifiers={[lit && 'place-lit']} {...frame}>
      <span className="asset-school-flagpole" />
      <span className="asset-school-flag" />
      <span className="asset-school-roof" />
      <span className="asset-school-tower-cap" />
      <span className="asset-school-tower" />
      <span className="asset-school-clock" />
      <span className="asset-school-wing" />
      <span className="asset-school-windows asset-school-windows-a" />
      <span className="asset-school-windows asset-school-windows-b" />
      <span className="asset-school-center" />
      <span className="asset-school-sign">SCHOOL</span>
      <span className="asset-school-door" />
      <span className="asset-school-steps" />
    </AssetFrame>
  );
}
