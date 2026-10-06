import { render, screen } from '@testing-library/react';

import Skeleton from './Skeleton';

test('renders a placeholder with page classes and optional sizing text', () => {
  render(<Skeleton className="users-skeleton circle">Loading</Skeleton>);

  expect(screen.getByText('Loading')).toHaveClass('skeleton', 'users-skeleton', 'circle');
});
