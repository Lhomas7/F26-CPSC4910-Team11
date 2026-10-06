import AssetFrame from '../AssetFrame';
import './People.css';

/**
 * Side-on person. variant: "adult" or "child". Colours are any CSS colour;
 * `walking` swings the arms and legs (move the asset yourself to make them go
 * somewhere), `waving` raises the front arm.
 */
export function Person({
  variant = 'adult',
  skin = '#d9a77c',
  hair = '#3b2a20',
  shirt = '#3a7bd5',
  pants = '#2f3a4a',
  walking = false,
  waving = false,
  ...frame
}) {
  const style = { '--skin': skin, '--hair': hair, '--shirt': shirt, '--pants': pants, ...frame.style };
  return (
    <AssetFrame
      name="person"
      modifiers={[`person-${variant}`, walking && 'walking', waving && 'waving']}
      {...frame}
      style={style}
    >
      <span className="asset-person-leg asset-person-leg-back" />
      <span className="asset-person-arm asset-person-arm-back" />
      <span className="asset-person-torso" />
      <span className="asset-person-leg asset-person-leg-front" />
      <span className="asset-person-head" />
      <span className="asset-person-hair" />
      <span className="asset-person-arm asset-person-arm-front" />
    </AssetFrame>
  );
}

/** A dog. `walking` moves its legs; the tail wags unless `wagging` is false. */
export function Dog({ color = '#a8743f', walking = false, wagging = true, ...frame }) {
  return (
    <AssetFrame
      name="dog"
      modifiers={[walking && 'walking', wagging && 'wagging']}
      {...frame}
      style={{ '--dog-color': color, ...frame.style }}
    >
      <span className="asset-dog-tail" />
      <span className="asset-dog-leg asset-dog-leg-a" />
      <span className="asset-dog-leg asset-dog-leg-b" />
      <span className="asset-dog-body" />
      <span className="asset-dog-leg asset-dog-leg-c" />
      <span className="asset-dog-leg asset-dog-leg-d" />
      <span className="asset-dog-head" />
      <span className="asset-dog-ear" />
      <span className="asset-dog-nose" />
      <span className="asset-dog-collar" />
    </AssetFrame>
  );
}
