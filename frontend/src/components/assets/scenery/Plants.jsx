import AssetFrame from '../AssetFrame';
import './Plants.css';

/** Roadside tree. variant: "round" (leafy) or "pine". `sway` rocks it gently. */
export function Tree({ variant = 'round', sway = true, ...frame }) {
  return (
    <AssetFrame name="tree" modifiers={[`tree-${variant}`, sway && 'swaying']} {...frame}>
      <span className="asset-tree-trunk" />
      <span className="asset-tree-canopy" />
    </AssetFrame>
  );
}

/** Low hedge bush. `flowers` dots it with blossoms. */
export function Bush({ flowers = false, ...frame }) {
  return (
    <AssetFrame name="bush" modifiers={[flowers && 'bush-flowers']} {...frame}>
      <span className="asset-bush-leaves" />
    </AssetFrame>
  );
}
