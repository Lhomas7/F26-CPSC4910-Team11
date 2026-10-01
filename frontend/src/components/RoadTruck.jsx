import './RoadTruck.css';

// Decorative road lane with a truck driving along it.
// mode="loop" drives back and forth forever; mode="arrive" sits at the start
// until `arrived` is true, then drives to the end once.
export default function RoadTruck({ mode = 'loop', arrived = false, className = '' }) {
  const truckClasses = [
    'road-truck',
    `road-truck-${mode}`,
    mode === 'arrive' && arrived ? 'road-truck-arrived' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`road-lane ${className}`.trim()} aria-hidden="true">
      <div className={truckClasses}>
        <span className="road-truck-trailer" />
        <span className="road-truck-cab" />
        <span className="road-truck-wheel road-truck-wheel-a" />
        <span className="road-truck-wheel road-truck-wheel-b" />
        <span className="road-truck-wheel road-truck-wheel-c" />
      </div>
    </div>
  );
}
