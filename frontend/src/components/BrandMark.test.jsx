// Decorative, aria-hidden markup has no role or text to query, so these tests
// look up elements by class.
/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { render } from '@testing-library/react';

import BrandMark from './BrandMark';

test('renders a decorative mark with an optional extra class', () => {
  const { container } = render(<BrandMark className="login-brand-mark" />);
  const mark = container.querySelector('.brand-mark');

  expect(mark).toHaveClass('login-brand-mark');
  expect(mark).toHaveAttribute('aria-hidden', 'true');
});
