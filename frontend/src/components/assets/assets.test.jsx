// Decorative, aria-hidden drawings have no role or text to query, so these
// tests look up elements by class.
/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { render } from '@testing-library/react';

import {
  Ambulance,
  Bench,
  Building,
  Bush,
  Car,
  CityBus,
  Cloud,
  Collision,
  Dog,
  DoubleDeckerBus,
  Fire,
  FireHydrant,
  FireTruck,
  Flame,
  GasStation,
  Impact,
  Moon,
  Person,
  PoliceCar,
  Road,
  RoadBarrier,
  School,
  SchoolBus,
  SchoolZoneSign,
  SemiTruck,
  Smoke,
  SpeedLimitSign,
  StopSign,
  StreetLamp,
  Sun,
  Taxi,
  TrafficCone,
  TrafficLight,
  Tree,
  Wheel,
  YieldSign,
} from '.';

test.each([
  ['semi-truck', SemiTruck],
  ['fire-truck', FireTruck],
  ['ambulance', Ambulance],
  ['sedan', Car],
  ['police-car', PoliceCar],
  ['taxi', Taxi],
  ['building', Building],
  ['tree', Tree],
  ['bush', Bush],
  ['traffic-light', TrafficLight],
  ['collision', Collision],
  ['school-bus', SchoolBus],
  ['city-bus', CityBus],
  ['double-decker', DoubleDeckerBus],
  ['spare-wheel', Wheel],
  ['person', Person],
  ['dog', Dog],
  ['gas-station', GasStation],
  ['school', School],
  ['street-lamp', StreetLamp],
  ['bench', Bench],
  ['hydrant', FireHydrant],
  ['cone', TrafficCone],
  ['barrier', RoadBarrier],
  ['stop-sign', StopSign],
  ['yield-sign', YieldSign],
  ['speed-limit-sign', SpeedLimitSign],
  ['school-zone-sign', SchoolZoneSign],
  ['cloud', Cloud],
  ['sun', Sun],
  ['moon', Moon],
  ['flame', Flame],
  ['impact', Impact],
  ['smoke', Smoke],
])('%s renders as a hidden, scalable drawing', (name, Asset) => {
  const { container } = render(<Asset scale={2} className="extra" />);
  const asset = container.querySelector(`.asset-${name}`);

  expect(asset).toHaveClass('asset', 'extra');
  expect(asset).toHaveAttribute('aria-hidden', 'true');
  expect(asset.style.getPropertyValue('--asset-scale')).toBe('2');
});

test('vehicles mirror, drive, speed and switch lights off', () => {
  const { container } = render(<PoliceCar facing="left" speeding lights={false} />);
  const car = container.querySelector('.asset-police-car');

  expect(car).toHaveClass(
    'asset-facing-left',
    'asset-moving',
    'asset-speeding',
    'asset-lights-off',
  );
  expect(car.querySelector('.asset-speed-lines')).toBeInTheDocument();
});

test('Car takes a colour and FireTruck can spray', () => {
  const { container } = render(
    <>
      <Car color="#ff0000" />
      <FireTruck spraying />
    </>,
  );

  expect(container.querySelector('.asset-sedan').style.getPropertyValue('--car-color')).toBe(
    '#ff0000',
  );
  expect(container.querySelector('.asset-fire-spray')).toBeInTheDocument();
});

test('Building variants, traffic light states and collision delay set their classes', () => {
  const { container } = render(
    <>
      <Building variant="warehouse" lit />
      <TrafficLight state="red" />
      <Collision delay={1.5} />
      <Road lanes={1} shoulders={false} />
    </>,
  );

  expect(container.querySelector('.asset-building')).toHaveClass(
    'asset-building-warehouse',
    'asset-building-lit',
  );
  expect(container.querySelector('.asset-traffic-light')).toHaveClass('asset-signal-state-red');
  expect(
    container.querySelector('.asset-collision').style.getPropertyValue('--collision-delay'),
  ).toBe('1.5s');
  expect(container.querySelector('.asset-road')).not.toHaveClass(
    'asset-road-dashed',
    'asset-road-shoulders',
  );
});

test('new asset options set their classes and content', () => {
  const { container } = render(
    <>
      <SchoolBus stopArm />
      <Person variant="child" walking waving shirt="#123456" />
      <Dog walking wagging={false} />
      <SpeedLimitSign limit={15} />
      <SchoolZoneSign active />
      <StreetLamp lit />
      <Smoke loop />
    </>,
  );

  expect(container.querySelector('.asset-school-bus')).toHaveClass('asset-stop-arm-out');
  const child = container.querySelector('.asset-person');
  expect(child).toHaveClass('asset-person-child', 'asset-walking', 'asset-waving');
  expect(child.style.getPropertyValue('--shirt')).toBe('#123456');
  expect(container.querySelector('.asset-dog')).toHaveClass('asset-walking');
  expect(container.querySelector('.asset-dog')).not.toHaveClass('asset-wagging');
  expect(container.querySelector('.asset-limit-number')).toHaveTextContent('15');
  expect(container.querySelector('.asset-school-zone-sign')).toHaveClass('asset-zone-active');
  expect(container.querySelector('.asset-street-lamp')).toHaveClass('asset-lamp-lit');
  expect(container.querySelector('.asset-smoke')).toHaveClass('asset-smoke-loop');
});

test('vehicles take crash poses, wheels roll away, and fire takes its timing', () => {
  const { container } = render(
    <>
      <Car crash="tip" moving />
      <SchoolBus crash="flip" facing="left" />
      <Wheel rolling="left" />
      <Fire delay={1} spread={10} dousedAt={15} />
    </>,
  );

  const car = container.querySelector('.asset-sedan');
  expect(car).toHaveClass('asset-crash-tip');
  expect(car).not.toHaveClass('asset-moving');
  expect(container.querySelector('.asset-school-bus')).toHaveClass(
    'asset-crash-flip',
    'asset-facing-left',
  );

  const wheel = container.querySelector('.asset-spare-wheel');
  expect(wheel).toHaveClass('asset-rolling');
  expect(wheel.style.getPropertyValue('--roll')).toBe('-1');

  const fire = container.querySelector('.asset-fire');
  expect(fire.style.getPropertyValue('--fire-delay')).toBe('1s');
  expect(fire.style.getPropertyValue('--fire-spread')).toBe('10s');
  expect(fire.style.getPropertyValue('--fire-doused-at')).toBe('15s');
  expect(fire.querySelectorAll('.asset-flame')).toHaveLength(4);
});

test('the semi truck has its detail parts and keeps its exhaust on the cab', () => {
  const { container } = render(<SemiTruck facing="left" moving />);
  const truck = container.querySelector('.asset-semi-truck');

  [
    'trailer', 'trailer-stripe', 'trailer-door', 'taillight', 'marker', 'landing-gear',
    'fairing', 'cab', 'cab-door', 'window', 'grille', 'headlight', 'bumper',
    'exhaust', 'exhaust-cap', 'fuel-tank',
  ].forEach((part) => expect(truck.querySelector(`.asset-semi-${part}`)).toBeInTheDocument());
  expect(truck.querySelectorAll('.asset-semi-wheel')).toHaveLength(4);
  expect(truck).toHaveClass('asset-facing-left', 'asset-moving');
});
