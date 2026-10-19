import { fireEvent, render, screen } from '@testing-library/react';

import PlaygroundPage from './PlaygroundPage';

test('shows every asset group and scene', () => {
  render(<PlaygroundPage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Asset playground' })).toBeInTheDocument();
  [
    'Vehicles',
    'Buses',
    'People and animals',
    'Places',
    'Street furniture and signs',
    'Nature and sky',
    'Effects',
    'Scenes',
  ].forEach((name) => expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument());
  ['School zone', 'Pulled over', 'Collision', 'Road truck easter eggs'].forEach((name) =>
    expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument(),
  );
});

test('the road truck controls toggle wreck and recover', () => {
  render(<PlaygroundPage />);

  fireEvent.click(screen.getByRole('button', { name: 'Wreck' }));
  expect(screen.getByRole('button', { name: 'Recover' })).toBeInTheDocument();
});
