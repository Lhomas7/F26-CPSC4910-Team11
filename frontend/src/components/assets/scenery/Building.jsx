import AssetFrame from '../AssetFrame';
import './Building.css';

const PARTS = {
  office: (
    <>
      <span className="asset-bld-antenna" />
      <span className="asset-bld-ledge" />
      <span className="asset-bld-body" />
      <span className="asset-bld-windows" />
      <span className="asset-bld-door" />
    </>
  ),
  house: (
    <>
      <span className="asset-house-chimney" />
      <span className="asset-house-roof" />
      <span className="asset-bld-body" />
      <span className="asset-house-window" />
      <span className="asset-bld-door" />
    </>
  ),
  shop: (
    <>
      <span className="asset-bld-body" />
      <span className="asset-shop-sign" />
      <span className="asset-shop-awning" />
      <span className="asset-shop-window" />
      <span className="asset-bld-door" />
    </>
  ),
  warehouse: (
    <>
      <span className="asset-depot-roof" />
      <span className="asset-bld-body" />
      <span className="asset-depot-band" />
      <span className="asset-bld-windows" />
      <span className="asset-depot-door asset-depot-door-a" />
      <span className="asset-depot-door asset-depot-door-b" />
    </>
  ),
};

/**
 * Backdrop building. variant: "office" (set `floors`), "house", "shop", or
 * "warehouse" (a truck depot with roll-up doors). `color` tints the walls;
 * `lit` switches the windows to warm night-time light.
 */
export default function Building({ variant = 'office', color, floors = 5, lit = false, ...frame }) {
  const style = {
    ...(color ? { '--building-color': color } : {}),
    '--floors': floors,
    ...frame.style,
  };
  return (
    <AssetFrame
      name="building"
      modifiers={[`building-${variant}`, lit && 'building-lit']}
      {...frame}
      style={style}
    >
      {PARTS[variant] || PARTS.office}
    </AssetFrame>
  );
}
