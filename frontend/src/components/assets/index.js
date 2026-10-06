// CSS-drawn illustration assets. Everything is decorative (aria-hidden), drawn
// facing right, sized in em, and accepts `facing`, `scale`, `className` and
// `style`. Vehicles also take `moving` and `speeding`; emergency vehicles take
// `lights`. Try them all out at /playground.
export { default as AssetFrame } from './AssetFrame';

// Vehicles
export { default as SemiTruck } from './vehicles/SemiTruck';
export { default as FireTruck } from './vehicles/FireTruck';
export { default as Ambulance } from './vehicles/Ambulance';
export { default as Car, PoliceCar, Taxi } from './vehicles/Car';
export { CityBus, DoubleDeckerBus, SchoolBus } from './vehicles/Buses';
export { default as Wheel } from './vehicles/Wheel';

// People and animals
export { Dog, Person } from './people/People';

// Scenery
export { default as Road } from './scenery/Road';
export { default as Building } from './scenery/Building';
export { GasStation, School } from './scenery/Places';
export { Bush, Tree } from './scenery/Plants';
export { Cloud, Moon, Sun } from './scenery/Sky';
export { SchoolZoneSign, SpeedLimitSign, StopSign, YieldSign } from './scenery/Signs';
export { Bench, FireHydrant, RoadBarrier, StreetLamp, TrafficCone } from './scenery/StreetFurniture';
export { default as TrafficLight } from './scenery/TrafficLight';

// Effects
export { default as Collision } from './effects/Collision';
export { default as Fire } from './effects/Fire';
export { default as Flame } from './effects/Flame';
export { default as Impact } from './effects/Impact';
export { default as Smoke } from './effects/Smoke';
