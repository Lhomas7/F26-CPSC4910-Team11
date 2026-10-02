import AssetFrame from '../AssetFrame';
import './Flame.css';

/** A single flickering flame. Set --flicker-speed to change the flicker. */
export default function Flame(frame) {
  return (
    <AssetFrame name="flame" {...frame}>
      <span className="asset-flame-fire" />
    </AssetFrame>
  );
}
