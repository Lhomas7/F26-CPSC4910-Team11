import { useEffect, useState } from 'react';

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
} from '../../components/assets';
import RoadTruck from '../../components/branding/RoadTruck';
import './PlaygroundPage.css';

// Unlinked sandbox for trying out the drawn assets and animation ideas.
// Nothing in the app links here; open /playground directly.
//
// Each gallery item is { name, render(props), flags?, colors?, selects?,
// numbers?, size?, night?, replay? }:
// - flags: boolean props shown as checkboxes, with their starting values
// - colors / selects / numbers: other props with a colour picker (starting
//   colour), dropdown (list of options) or number box ([start, min, max, step])
// - size: multiplier on the page-wide size slider
// - night: the prop that the page-wide night toggle switches on (e.g. "lit")
// - replay: one-shot effect; shows a Replay button that remounts it
// A select value of "none" is passed as undefined.
const CRASH_POSES = ['none', 'tip', 'flip'];

const GROUPS = [
  {
    title: 'Vehicles',
    items: [
      { name: 'Semi truck', render: (p) => <SemiTruck {...p} />, flags: { moving: false, speeding: false }, selects: { crash: CRASH_POSES } },
      { name: 'Car', render: (p) => <Car {...p} />, flags: { moving: false, speeding: false }, selects: { crash: CRASH_POSES }, colors: { color: '#3a7bd5' } },
      { name: 'Taxi', render: (p) => <Taxi {...p} />, flags: { moving: false, speeding: false }, selects: { crash: CRASH_POSES } },
      { name: 'Police car', render: (p) => <PoliceCar {...p} />, flags: { moving: false, speeding: false, lights: true }, selects: { crash: CRASH_POSES } },
      { name: 'Ambulance', render: (p) => <Ambulance {...p} />, flags: { moving: false, speeding: false, lights: true }, selects: { crash: CRASH_POSES } },
      { name: 'Fire truck', render: (p) => <FireTruck {...p} />, flags: { moving: false, speeding: false, lights: true, spraying: false }, selects: { crash: CRASH_POSES } },
    ],
  },
  {
    title: 'Buses',
    items: [
      { name: 'School bus', render: (p) => <SchoolBus {...p} />, flags: { moving: false, speeding: false, stopArm: false }, selects: { crash: CRASH_POSES }, size: 0.75 },
      { name: 'City bus', render: (p) => <CityBus {...p} />, flags: { moving: false, speeding: false }, selects: { crash: CRASH_POSES }, size: 0.7 },
      { name: 'London double-decker', render: (p) => <DoubleDeckerBus {...p} />, flags: { moving: false, speeding: false }, selects: { crash: CRASH_POSES }, size: 0.75 },
    ],
  },
  {
    title: 'People and animals',
    items: [
      {
        name: 'Adult',
        render: (p) => <Person {...p} />,
        flags: { walking: false, waving: false },
        colors: { shirt: '#3a7bd5', pants: '#2f3a4a', skin: '#d9a77c', hair: '#3b2a20' },
        size: 1.25,
      },
      {
        name: 'Child',
        render: (p) => <Person variant="child" {...p} />,
        flags: { walking: false, waving: false },
        colors: { shirt: '#f2c230', pants: '#3a7bd5', skin: '#8d5a3b', hair: '#1d201d' },
        size: 1.25,
      },
      { name: 'Dog', render: (p) => <Dog {...p} />, flags: { walking: false, wagging: true }, colors: { color: '#a8743f' }, size: 1.25 },
    ],
  },
  {
    title: 'Places',
    items: [
      { name: 'Office', render: (p) => <Building variant="office" floors={4} {...p} />, size: 0.5, night: 'lit' },
      { name: 'House', render: (p) => <Building variant="house" {...p} />, size: 0.5, night: 'lit' },
      { name: 'Shop', render: (p) => <Building variant="shop" {...p} />, size: 0.5, night: 'lit' },
      { name: 'Warehouse / depot', render: (p) => <Building variant="warehouse" {...p} />, size: 0.5, night: 'lit' },
      { name: 'Gas station', render: (p) => <GasStation {...p} />, size: 0.4, night: 'lit' },
      { name: 'School', render: (p) => <School {...p} />, size: 0.4, night: 'lit' },
    ],
  },
  {
    title: 'Street furniture and signs',
    items: [
      { name: 'Street lamp', render: (p) => <StreetLamp {...p} />, size: 0.75, night: 'lit' },
      { name: 'Traffic light', render: (p) => <TrafficLight {...p} />, selects: { state: ['cycle', 'green', 'yellow', 'red'] }, size: 0.75 },
      { name: 'Stop sign', render: (p) => <StopSign {...p} />, size: 0.85 },
      { name: 'Yield sign', render: (p) => <YieldSign {...p} />, size: 0.85 },
      { name: 'Speed limit', render: (p) => <SpeedLimitSign {...p} />, numbers: { limit: [25, 5, 85, 5] }, size: 0.85 },
      { name: 'School zone', render: (p) => <SchoolZoneSign {...p} />, flags: { active: true }, size: 0.85 },
      { name: 'Road barrier', render: (p) => <RoadBarrier {...p} />, flags: { blinking: true } },
      {
        name: 'Cone, hydrant, bench',
        render: (p) => (
          <>
            <TrafficCone {...p} />
            <FireHydrant {...p} />
            <Bench {...p} />
          </>
        ),
      },
    ],
  },
  {
    title: 'Nature and sky',
    items: [
      {
        name: 'Trees',
        render: (p) => (
          <>
            <Tree {...p} />
            <Tree variant="pine" {...p} />
          </>
        ),
        flags: { sway: true },
        size: 0.7,
      },
      {
        name: 'Bushes',
        render: (p) => (
          <>
            <Bush {...p} />
            <Bush flowers {...p} />
          </>
        ),
        size: 0.7,
      },
      { name: 'Cloud', render: (p) => <Cloud {...p} />, flags: { drifting: true }, size: 0.7 },
      {
        name: 'Sun and moon',
        render: (p) => (
          <>
            <Sun {...p} />
            <Moon {...p} />
          </>
        ),
        size: 0.7,
      },
    ],
  },
  {
    title: 'Effects',
    items: [
      { name: 'Collision', render: (p) => <Collision {...p} />, replay: true },
      { name: 'Impact flash', render: (p) => <Impact {...p} />, replay: true },
      {
        name: 'Fire (spreading)',
        render: ({ doused, spread, ...p }) => <Fire spread={spread} dousedAt={doused ? spread + 3 : undefined} {...p} />,
        flags: { doused: false },
        numbers: { spread: [8, 2, 30, 1] },
        replay: true,
      },
      { name: 'Flame', render: (p) => <Flame {...p} /> },
      { name: 'Smoke', render: (p) => <Smoke {...p} />, flags: { loop: true }, replay: true },
      { name: 'Wheel', render: (p) => <Wheel {...p} />, selects: { rolling: ['right', 'left', 'none'] }, replay: true },
    ],
  },
];

function initialValues(item) {
  const values = { ...item.flags, ...item.colors };
  Object.entries(item.selects || {}).forEach(([prop, options]) => { values[prop] = options[0]; });
  Object.entries(item.numbers || {}).forEach(([prop, [start]]) => { values[prop] = start; });
  return values;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="pg-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function AssetCard({ item, scale, facing, night }) {
  const [values, setValues] = useState(() => initialValues(item));
  const [run, setRun] = useState(0);
  const set = (prop) => (value) => setValues({ ...values, [prop]: value });

  const props = { scale: scale * (item.size || 1), facing };
  Object.entries(values).forEach(([prop, value]) => { props[prop] = value === 'none' ? undefined : value; });
  if (item.night) props[item.night] = night;

  return (
    <figure className="pg-card">
      <div className="pg-stage" key={run}>{item.render(props)}</div>
      <figcaption>
        <strong>{item.name}</strong>
        <div className="pg-controls">
          {Object.keys(item.flags || {}).map((prop) => (
            <Toggle key={prop} label={prop} checked={values[prop]} onChange={set(prop)} />
          ))}
          {Object.keys(item.colors || {}).map((prop) => (
            <label key={prop} className="pg-toggle">
              <input type="color" value={values[prop]} onChange={(event) => set(prop)(event.target.value)} aria-label={`${item.name} ${prop}`} />
              {prop}
            </label>
          ))}
          {Object.entries(item.selects || {}).map(([prop, options]) => (
            <label key={prop} className="pg-toggle">
              {prop}
              <select value={values[prop]} onChange={(event) => set(prop)(event.target.value)}>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ))}
          {Object.entries(item.numbers || {}).map(([prop, [, min, max, step]]) => (
            <label key={prop} className="pg-toggle">
              {prop}
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={values[prop]}
                onChange={(event) => set(prop)(Number(event.target.value))}
              />
            </label>
          ))}
          {item.replay && <button type="button" onClick={() => setRun(run + 1)}>Replay</button>}
        </div>
      </figcaption>
    </figure>
  );
}

function SceneCard({ title, description, onReplay, children }) {
  return (
    <section className="pg-scene" aria-label={title}>
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {onReplay && <button type="button" onClick={onReplay}>Replay</button>}
      </header>
      {children}
    </section>
  );
}

/** Runs `steps` ([ms, name] pairs) after each replay; returns the latest step reached. */
function useTimeline(steps, run) {
  const [step, setStep] = useState('start');
  useEffect(() => {
    setStep('start');
    const timers = steps.map(([ms, name]) => setTimeout(() => setStep(name), ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  return step;
}

const PULLOVER_STEPS = [[4200, 'stopped']];

function PulledOverScene() {
  const [run, setRun] = useState(0);
  const stopped = useTimeline(PULLOVER_STEPS, run) === 'stopped';

  return (
    <SceneCard title="Pulled over" description="A speeder gets chased down and pulls onto the shoulder." onReplay={() => setRun(run + 1)}>
      <Road key={run} className="pg-scene-road pg-pullover">
        <span className="pg-pull-speeder"><Car color="#d64545" moving={!stopped} speeding={!stopped} /></span>
        <span className="pg-pull-cop"><PoliceCar moving={!stopped} /></span>
      </Road>
    </SceneCard>
  );
}

const COLLISION_STEPS = [[1190, 'impact']];

function CollisionScene() {
  const [run, setRun] = useState(0);
  const impact = useTimeline(COLLISION_STEPS, run) === 'impact';

  return (
    <SceneCard title="Collision" description="Head-on: both cars bounce back and the impact effect plays." onReplay={() => setRun(run + 1)}>
      <Road key={run} lanes={1} className="pg-scene-road pg-collision">
        <span className="pg-crash-a"><Car moving={!impact} /></span>
        <span className="pg-crash-b"><Taxi facing="left" moving={!impact} /></span>
        <Collision className="pg-crash-burst" delay={1.19} />
      </Road>
    </SceneCard>
  );
}

// School bus pulls up and puts its stop arm out, the kids (and a dog) get off
// and walk to school, and a car coming up behind has to wait.
const SCHOOL_STEPS = [[2300, 'stopped'], [2700, 'arm'], [3100, 'unloading'], [8600, 'done']];

function SchoolZoneScene({ night }) {
  const [run, setRun] = useState(0);
  const step = useTimeline(SCHOOL_STEPS, run);
  const busStopped = step !== 'start';
  const armOut = ['arm', 'unloading'].includes(step);
  const kidsOut = ['unloading', 'done'].includes(step);
  const kidsWalking = step === 'unloading';

  return (
    <SceneCard
      title="School zone"
      description="The bus stops with its arm out; the car behind waits while the kids head into school."
      onReplay={() => setRun(run + 1)}
    >
      <div className={`pg-zone ${night ? 'pg-zone-night' : ''}`} key={run}>
        <div className="pg-zone-backdrop">
          <Tree scale={0.9} />
          <School lit={night} />
          <SchoolZoneSign active />
          <SpeedLimitSign limit={15} />
          <StreetLamp lit={night} />
          <Tree variant="pine" scale={0.9} />
        </div>
        <div className="pg-zone-sidewalk">
          {kidsOut && (
            <>
              <span className="pg-kid pg-kid-a"><Person variant="child" walking={kidsWalking} facing="left" /></span>
              <span className="pg-kid pg-kid-b">
                <Person variant="child" walking={kidsWalking} facing="left" shirt="#d64545" pants="#2f3a4a" skin="#8d5a3b" hair="#1d201d" />
              </span>
              <span className="pg-kid pg-kid-c"><Dog walking={kidsWalking} facing="left" /></span>
            </>
          )}
        </div>
        <Road className="pg-scene-road pg-zone-road">
          <span className="pg-zone-bus"><SchoolBus moving={!busStopped} stopArm={armOut} /></span>
          <span className="pg-zone-car"><Car color="#7f8f7d" moving={!busStopped} /></span>
        </Road>
      </div>
    </SceneCard>
  );
}

function RoadTruckScene() {
  const [mode, setMode] = useState('loop');
  const [arrived, setArrived] = useState(false);
  const [crashKey, setCrashKey] = useState(0);
  const [wrecked, setWrecked] = useState(false);
  const [fastRescue, setFastRescue] = useState(true);

  return (
    <SceneCard
      title="Road truck easter eggs"
      description="The truck from the Login, Welcome and About pages. Wrecked is what the Login page shows while the server is down."
    >
      <div className="pg-truck-panel">
        <RoadTruck
          key={mode}
          className={`pg-truck-lane ${fastRescue ? 'pg-fast-rescue' : ''}`}
          mode={mode}
          arrived={arrived}
          crashKey={crashKey}
          wrecked={wrecked}
        />
      </div>
      <div className="pg-controls">
        <label className="pg-toggle">
          mode
          <select value={mode} onChange={(event) => { setMode(event.target.value); setArrived(false); }}>
            <option value="loop">loop</option>
            <option value="arrive">arrive</option>
          </select>
        </label>
        {mode === 'arrive' && <Toggle label="arrived" checked={arrived} onChange={setArrived} />}
        <button type="button" onClick={() => setCrashKey(crashKey + 1)}>Crash</button>
        <button type="button" onClick={() => setWrecked(!wrecked)}>{wrecked ? 'Recover' : 'Wreck'}</button>
        <Toggle label="fast rescue (3s)" checked={fastRescue} onChange={setFastRescue} />
      </div>
    </SceneCard>
  );
}

export default function PlaygroundPage() {
  const [scale, setScale] = useState(2);
  const [facing, setFacing] = useState('right');
  const [night, setNight] = useState(false);

  useEffect(() => {
    document.title = 'Asset playground | Good Driver Incentive Program';
  }, []);

  return (
    <main className={`pg-page ${night ? 'pg-night' : ''}`}>
      <header className="pg-header">
        <h1>Asset playground</h1>
        <p>
          Not linked from anywhere. The drawings live in <code>src/components/assets</code>; everything here is
          decorative and drawn with CSS.
        </p>
        <div className="pg-controls pg-global">
          <label className="pg-toggle">
            size
            <input type="range" min="0.75" max="4" step="0.25" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
            {scale}×
          </label>
          <Toggle label="face left" checked={facing === 'left'} onChange={(value) => setFacing(value ? 'left' : 'right')} />
          <Toggle label="night" checked={night} onChange={setNight} />
        </div>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h2>{group.title}</h2>
          <div className="pg-grid">
            {group.items.map((item) => (
              <AssetCard key={item.name} item={item} scale={scale} facing={facing} night={night} />
            ))}
          </div>
        </section>
      ))}

      <section aria-label="Street scene">
        <h2>Street scene</h2>
        <div className="pg-street">
          <div className="pg-skyline">
            <Building variant="office" floors={6} lit={night} />
            <StreetLamp lit={night} />
            <Building variant="shop" lit={night} color="#c9a46b" />
            <Bush flowers />
            <GasStation lit={night} scale={0.8} />
            <Tree variant="pine" />
            <Building variant="house" lit={night} />
            <TrafficLight />
            <Building variant="warehouse" lit={night} />
            <Bush />
          </div>
          <Road className="pg-street-road">
            <span className="pg-traffic pg-traffic-a"><SemiTruck moving /></span>
            <span className="pg-traffic pg-traffic-b"><DoubleDeckerBus moving facing="left" scale={0.7} /></span>
            <span className="pg-traffic pg-traffic-c"><Taxi moving /></span>
          </Road>
        </div>
      </section>

      <section aria-label="Scenes">
        <h2>Scenes</h2>
        <SchoolZoneScene night={night} />
        <PulledOverScene />
        <CollisionScene />
        <RoadTruckScene />
      </section>
    </main>
  );
}
