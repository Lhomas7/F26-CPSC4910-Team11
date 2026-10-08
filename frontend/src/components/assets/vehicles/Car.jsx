import AssetFrame, { SpeedLines, vehicleModifiers } from '../AssetFrame';
import './Car.css';

function Sedan({ name, color, moving, speeding, crash, lights, extras, frame }) {
  const style = color ? { '--car-color': color, ...frame.style } : frame.style;
  return (
    <AssetFrame
      name={name}
      modifiers={['car', ...vehicleModifiers({ moving, speeding, crash, lights })]}
      {...frame}
      style={style}
    >
      {speeding && <SpeedLines />}
      <span className="asset-car-cabin" />
      <span className="asset-window asset-car-window" />
      <span className="asset-car-body" />
      <span className="asset-car-headlight" />
      <span className="asset-car-taillight" />
      {extras}
      <span className="asset-wheel asset-car-wheel-a" />
      <span className="asset-wheel asset-car-wheel-b" />
    </AssetFrame>
  );
}

/** Everyday sedan. `color` is any CSS colour. */
export default function Car({ color, moving = false, speeding = false, crash, ...frame }) {
  return (
    <Sedan
      name="sedan"
      color={color}
      moving={moving}
      speeding={speeding}
      crash={crash}
      frame={frame}
    />
  );
}

/** Black-and-white patrol car with a light bar. */
export function PoliceCar({ moving = false, speeding = false, crash, lights = true, ...frame }) {
  return (
    <Sedan
      name="police-car"
      moving={moving}
      speeding={speeding}
      crash={crash}
      lights={lights}
      extras={<span className="asset-lightbar asset-car-lightbar" />}
      frame={frame}
    />
  );
}

/** Yellow cab with a roof sign. */
export function Taxi({ moving = false, speeding = false, crash, ...frame }) {
  return (
    <Sedan
      name="taxi"
      moving={moving}
      speeding={speeding}
      crash={crash}
      extras={<span className="asset-taxi-sign" />}
      frame={frame}
    />
  );
}
