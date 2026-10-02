import AssetFrame from '../AssetFrame';

/** A lone wheel (with a spoke mark so rolling shows), e.g. one that's come off. */
export default function Wheel(frame) {
  return (
    <AssetFrame name="spare-wheel" {...frame}>
      <span className="asset-wheel" />
    </AssetFrame>
  );
}
