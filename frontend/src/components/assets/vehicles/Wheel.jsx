import AssetFrame from '../AssetFrame';

/**
 * A lone wheel (with a spoke mark so rolling shows), e.g. one that's come off.
 * `rolling` ("left" or "right") bounces it away in that direction once; set
 * --roll-distance (default 3.75em) and --roll-delay to tune it.
 */
export default function Wheel({ rolling, ...frame }) {
  const style = rolling ? { '--roll': rolling === 'left' ? -1 : 1, ...frame.style } : frame.style;
  return (
    <AssetFrame name="spare-wheel" modifiers={[rolling && 'rolling']} {...frame} style={style}>
      <span className="asset-wheel" />
    </AssetFrame>
  );
}
