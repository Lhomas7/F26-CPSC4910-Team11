import AssetFrame from '../AssetFrame';
import './Impact.css';

/**
 * Quick yellow impact flash for bumps and knocks (Collision is the big one).
 * Plays once on mount; --impact-delay and --impact-duration time it.
 */
export default function Impact(frame) {
  return (
    <AssetFrame name="impact" {...frame}>
      <span className="asset-impact-burst" />
    </AssetFrame>
  );
}
