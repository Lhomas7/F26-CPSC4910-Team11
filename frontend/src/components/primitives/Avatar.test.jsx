import { render, screen } from '@testing-library/react';

import Avatar from './Avatar';

test('shows initials when there is no picture and stays hidden from screen readers', () => {
  render(<Avatar name="Jamie Rivera" className="users-avatar" />);
  const avatar = screen.getByText('JR');

  expect(avatar).toHaveClass('avatar', 'users-avatar');
  expect(avatar).toHaveAttribute('aria-hidden', 'true');
});

test('shows the picture and announces the label when one is given', () => {
  render(<Avatar name="Jamie Rivera" src="/me.png" label="Profile picture for Jamie Rivera" />);

  expect(screen.getByRole('img', { name: 'Profile picture for Jamie Rivera' })).toBeInTheDocument();
  expect(screen.getByRole('presentation')).toHaveAttribute('src', '/me.png');
  expect(screen.queryByText('JR')).not.toBeInTheDocument();
});
