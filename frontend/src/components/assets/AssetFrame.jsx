import './assets.css';

// Common wrapper for every drawn asset: sizing, mirroring and the decorative
// aria-hidden flag. Layers: the outer .asset box is the caller's to position
// and animate; .asset-pose takes crash poses; .asset-art holds the drawing and
// is the layer that gets mirrored. `name` becomes the asset-<name> class the asset's CSS
// hangs off; `modifiers` are extra asset-<modifier> classes for flags like
// moving or lights-off. Position the asset with className/style.
export default function AssetFrame({
  name,
  facing = 'right',
  scale = 1,
  modifiers = [],
  className = '',
  style,
  children,
}) {
  const classes = [
    'asset',
    `asset-${name}`,
    facing === 'left' ? 'asset-facing-left' : '',
    ...modifiers.filter(Boolean).map((modifier) => `asset-${modifier}`),
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} style={{ '--asset-scale': scale, ...style }} aria-hidden="true">
      <span className="asset-pose">
        <span className="asset-art">{children}</span>
      </span>
    </span>
  );
}

/** Speed lines for vehicles; render inside the vehicle's art when speeding. */
export function SpeedLines() {
  return (
    <span className="asset-speed-lines">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Modifier list for the flags every vehicle supports. `crash` poses the
 * vehicle: "tip" lurches onto its nose and back (plays once each time it's
 * set), "flip" rolls onto its roof and stays there.
 */
export function vehicleModifiers({ moving, speeding, lights, crash }) {
  return [
    (moving || speeding) && !crash && 'moving',
    speeding && !crash && 'speeding',
    lights === false && 'lights-off',
    crash && `crash-${crash}`,
  ];
}
