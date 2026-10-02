import { render } from '@testing-library/react';

import BrandMark from './BrandMark';

test('renders a decorative mark with an optional extra class', () => {
  const { container } = render(<BrandMark className="login-brand-mark" />);
  const mark = container.querySelector('.brand-mark');

  expect(mark).toHaveClass('login-brand-mark');
  expect(mark).toHaveAttribute('aria-hidden', 'true');
});
