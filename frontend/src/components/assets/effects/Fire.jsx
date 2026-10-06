import AssetFrame from '../AssetFrame';
import Flame from './Flame';
import Smoke from './Smoke';
import './Fire.css';

/**
 * A spreading fire along a strip (sized to sit on a semi truck): four flames
 * catch one after another, grow, and send up smoke that thickens as it burns.
 *
 * Timing, in seconds: `delay` before the first flame; `spread` for the fire to
 * catch along the whole strip; `dousedAt` (from mount) for it to die down to a
 * smoulder — leave it out to burn forever. Each can also be set through the
 * --fire-delay, --fire-spread and --fire-doused-at CSS variables, e.g. when the
 * timing comes from other CSS.
 */
export default function Fire({ delay, spread, dousedAt, ...frame }) {
  const style = {
    ...(delay !== undefined ? { '--fire-delay': `${delay}s` } : {}),
    ...(spread !== undefined ? { '--fire-spread': `${spread}s` } : {}),
    ...(dousedAt !== undefined ? { '--fire-doused-at': `${dousedAt}s` } : {}),
    ...frame.style,
  };

  return (
    <AssetFrame name="fire" {...frame} style={style}>
      <Flame className="asset-fire-flame asset-fire-flame-1" />
      <Flame className="asset-fire-flame asset-fire-flame-2" scale={0.88} />
      <Flame className="asset-fire-flame asset-fire-flame-3" />
      <Flame className="asset-fire-flame asset-fire-flame-4" scale={0.8} />
      <Smoke loop className="asset-fire-plume asset-fire-plume-1" scale={1.1} />
      <Smoke loop className="asset-fire-plume asset-fire-plume-2" scale={1.1} />
      <Smoke loop className="asset-fire-plume asset-fire-plume-3" scale={1.1} />
    </AssetFrame>
  );
}
