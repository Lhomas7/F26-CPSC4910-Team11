import './assets.css';

// Common wrapper for every drawn asset: sizing, mirroring and the decorative
// aria-hidden flag. `name` becomes the asset-<name> class the asset's CSS
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
      <span className="asset-art">{children}</span>
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

/** Modifier list for the flags every vehicle supports. */
export function vehicleModifiers({ moving, speeding, lights }) {
  return [
    (moving || speeding) && 'moving',
    speeding && 'speeding',
    lights === false && 'lights-off',
  ];
}
