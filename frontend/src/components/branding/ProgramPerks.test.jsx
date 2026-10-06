import { render, screen } from '@testing-library/react';

import ProgramPerks from './ProgramPerks';

test('lists the program perks with the page class applied', () => {
  render(<ProgramPerks className="login-perks" />);

  const list = screen.getByRole('list');
  expect(list).toHaveClass('program-perks', 'login-perks');
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('Points from your sponsor for safe driving')).toBeInTheDocument();
});
