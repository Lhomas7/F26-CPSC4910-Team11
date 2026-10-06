import AssetFrame from '../AssetFrame';
import './Smoke.css';

/**
 * A puff of smoke that rises, drifts and fades. One-shot by default; `loop`
 * keeps puffing (a plume). Tune it with CSS variables on the asset or an
 * ancestor: --smoke-delay, --smoke-duration, --smoke-color,
 * --smoke-drift-x / --smoke-drift-y (em) and --smoke-spread (final scale).
 */
export default function Smoke({ loop = false, ...frame }) {
  return (
    <AssetFrame name="smoke" modifiers={[loop && 'smoke-loop']} {...frame}>
      <span className="asset-smoke-puff" />
    </AssetFrame>
  );
}
