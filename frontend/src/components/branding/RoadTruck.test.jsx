// Decorative, aria-hidden markup has no role or text to query, so these tests
// look up elements by class.
/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { act, render } from '@testing-library/react';

import RoadTruck, { CRASH_MS } from './RoadTruck';

test('loops by default and passes className to the lane', () => {
  const { container } = render(<RoadTruck className="page-lane" />);

  expect(container.querySelector('.road-lane.page-lane')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('.road-truck')).toHaveClass('road-truck-loop');
  expect(container.querySelector('.road-truck .asset-semi-truck')).toBeInTheDocument();
});

test('arrive mode only moves once arrived is true', () => {
  const { container, rerender } = render(<RoadTruck mode="arrive" />);
  const truck = container.querySelector('.road-truck');

  expect(truck).toHaveClass('road-truck-arrive');
  expect(truck).not.toHaveClass('road-truck-arrived');

  rerender(<RoadTruck mode="arrive" arrived />);
  expect(truck).toHaveClass('road-truck-arrived');
});

test('crashes when crashKey changes, then recovers', () => {
  jest.useFakeTimers();
  const { container, rerender } = render(<RoadTruck />);
  const truck = container.querySelector('.road-truck');

  expect(truck).not.toHaveClass('road-truck-crashed');

  rerender(<RoadTruck crashKey={1} />);
  expect(truck).toHaveClass('road-truck-crashed');
  expect(container.querySelector('.road-truck-vehicle')).toHaveClass('asset-crash-tip');
  expect(container.querySelector('.road-truck-impact')).toBeInTheDocument();

  act(() => jest.advanceTimersByTime(CRASH_MS));
  expect(truck).not.toHaveClass('road-truck-crashed');
  expect(container.querySelector('.road-truck-impact')).not.toBeInTheDocument();
  jest.useRealTimers();
});

test('stays wrecked while wrecked is true and recovers when it clears', () => {
  const { container, rerender } = render(<RoadTruck wrecked />);
  const truck = container.querySelector('.road-truck');

  expect(truck).toHaveClass('road-truck-wrecked');
  expect(container.querySelector('.road-truck-vehicle')).toHaveClass('asset-crash-flip');
  expect(container.querySelector('.road-truck-fire')).toBeInTheDocument();
  expect(container.querySelector('.road-truck-loose-wheel')).toBeInTheDocument();

  rerender(<RoadTruck />);
  expect(truck).not.toHaveClass('road-truck-wrecked');
  expect(container.querySelector('.road-truck-fire')).not.toBeInTheDocument();
  expect(container.querySelector('.road-truck-vehicle')).not.toHaveClass('asset-crash-flip');
});

test('sends a fire truck from the end of the road furthest from the wreck', () => {
  jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  jest.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockReturnValue(50);
  jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(46);

  const { container, rerender } = render(<RoadTruck />);
  expect(container.querySelector('.road-rescue')).not.toBeInTheDocument();

  rerender(<RoadTruck wrecked />);
  const rescue = container.querySelector('.road-rescue');
  expect(rescue).toHaveClass('road-rescue-from-right');
  expect(rescue).toHaveStyle({ '--wreck-left': '50px', '--wreck-right': '96px' });
  expect(container.querySelector('.road-truck-loose-wheel')).toHaveClass('road-truck-loose-wheel-back', 'asset-rolling');
  expect(container.querySelector('.road-truck-loose-wheel').style.getPropertyValue('--roll')).toBe('-1');
  expect(rescue.querySelector('.asset-fire-truck')).toHaveClass('asset-facing-left');

  rerender(<RoadTruck />);
  expect(container.querySelector('.road-rescue')).not.toBeInTheDocument();
  jest.restoreAllMocks();
});
