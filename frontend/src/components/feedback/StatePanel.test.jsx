import { render, screen } from '@testing-library/react';

import StatePanel from './StatePanel';

test('renders the title at the requested heading level with its content', () => {
  render(
    <StatePanel title="No users yet" headingLevel={1} className="users-state">
      <p>Drivers will appear here.</p>
    </StatePanel>,
  );

  expect(screen.getByRole('heading', { level: 1, name: 'No users yet' })).toBeInTheDocument();
  expect(screen.getByText('Drivers will appear here.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('error panels are announced as alerts', () => {
  render(<StatePanel title="Couldn't load" tone="error" />);

  expect(screen.getByRole('alert')).toHaveClass('state-panel-error');
  expect(screen.getByRole('heading', { level: 2, name: "Couldn't load" })).toBeInTheDocument();
});
