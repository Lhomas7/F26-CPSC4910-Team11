import AssetFrame from '../AssetFrame';
import './Collision.css';

const SHARDS = ['a', 'b', 'c', 'd', 'e', 'f'];

/**
 * One-shot impact: a flash, a shock ring, flying glass and metal, and smoke.
 * It plays once when mounted (remount it with a new `key` to replay); `delay`
 * (seconds) holds it back so it can line up with vehicles meeting.
 * Centre it on the point of impact.
 */
export default function Collision({ delay = 0, ...frame }) {
  return (
    <AssetFrame name="collision" {...frame} style={{ '--collision-delay': `${delay}s`, ...frame.style }}>
      <span className="asset-col-smoke asset-col-smoke-a" />
      <span className="asset-col-smoke asset-col-smoke-b" />
      <span className="asset-col-ring" />
      <span className="asset-col-flash" />
      {SHARDS.map((shard) => <span key={shard} className={`asset-col-shard asset-col-shard-${shard}`} />)}
    </AssetFrame>
  );
}
