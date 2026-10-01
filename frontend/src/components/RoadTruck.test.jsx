import { render } from '@testing-library/react';

import RoadTruck from './RoadTruck';

test('loops by default and passes className to the lane', () => {
  const { container } = render(<RoadTruck className="page-lane" />);

  expect(container.querySelector('.road-lane.page-lane')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('.road-truck')).toHaveClass('road-truck-loop');
  expect(container.querySelector('.road-truck-cab')).toBeInTheDocument();
});

test('arrive mode only moves once arrived is true', () => {
  const { container, rerender } = render(<RoadTruck mode="arrive" />);
  const truck = container.querySelector('.road-truck');

  expect(truck).toHaveClass('road-truck-arrive');
  expect(truck).not.toHaveClass('road-truck-arrived');

  rerender(<RoadTruck mode="arrive" arrived />);
  expect(truck).toHaveClass('road-truck-arrived');
});
