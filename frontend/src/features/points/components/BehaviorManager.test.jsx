import { fireEvent, render, screen, within } from '@testing-library/react';

import * as api from 'api';
import { ApiError } from 'api/client';
import BehaviorManager from './BehaviorManager';

jest.mock('api');

const braking = {
  id: 1,
  kind: 'bad',
  description: 'Hard braking',
  point_value: 50,
  signed_points: -50,
};

function group(name) {
  return screen.getByRole('region', { name });
}

function fillAndAdd(region, description, points) {
  fireEvent.change(within(region).getByLabelText('Behavior'), { target: { value: description } });
  fireEvent.change(within(region).getByLabelText('Points'), { target: { value: points } });
  fireEvent.click(within(region).getByRole('button', { name: 'Add' }));
}

beforeEach(() => api.getBehaviors.mockResolvedValue([braking]));
afterEach(() => jest.clearAllMocks());

test('sponsors add a rewarded behavior and see it listed', async () => {
  api.createBehavior.mockResolvedValue({
    id: 2,
    kind: 'good',
    description: 'Clean inspection',
    point_value: 100,
    signed_points: 100,
  });
  render(<BehaviorManager />);
  await screen.findByText('Hard braking');

  fillAndAdd(group('Earns points'), '  Clean   inspection ', '100');

  expect(await within(group('Earns points')).findByText('Clean inspection')).toBeInTheDocument();
  expect(api.createBehavior).toHaveBeenCalledWith({
    kind: 'good',
    description: 'Clean inspection',
    point_value: 100,
  });
  expect(screen.getByRole('status')).toHaveTextContent('Added “Clean inspection”.');
  expect(within(group('Earns points')).getByLabelText('Behavior')).toHaveValue('');
});

test('invalid entries are flagged without calling the server', async () => {
  render(<BehaviorManager />);
  await screen.findByText('Hard braking');

  fillAndAdd(group('Costs points'), ' ', '0');

  expect(await screen.findByText('Describe this behavior.')).toBeInTheDocument();
  expect(screen.getByText('Enter a whole number from 1 to 1,000,000.')).toBeInTheDocument();
  expect(api.createBehavior).not.toHaveBeenCalled();
});

test('server field errors are shown next to the field', async () => {
  api.createBehavior.mockRejectedValue(
    new ApiError('Bad request', 400, { description: ['This behavior is already listed.'] }),
  );
  render(<BehaviorManager />);
  await screen.findByText('Hard braking');

  fillAndAdd(group('Costs points'), 'hard braking', '10');

  expect(await screen.findByText('This behavior is already listed.')).toBeInTheDocument();
  expect(within(group('Costs points')).getAllByRole('listitem')).toHaveLength(1);
});

test('sponsors edit and remove behaviors', async () => {
  api.updateBehavior.mockResolvedValue({ ...braking, point_value: 75, signed_points: -75 });
  api.deleteBehavior.mockResolvedValue(null);
  render(<BehaviorManager />);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit Hard braking' }));
  const editing = screen.getByRole('form', { name: 'Edit Hard braking' });
  fireEvent.change(within(editing).getByLabelText('Points'), { target: { value: '75' } });
  fireEvent.click(within(editing).getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('−75 pts')).toBeInTheDocument();
  expect(api.updateBehavior).toHaveBeenCalledWith(1, {
    kind: 'bad',
    description: 'Hard braking',
    point_value: 75,
  });

  fireEvent.click(screen.getByRole('button', { name: 'Remove Hard braking' }));
  expect(await screen.findByText('Removed “Hard braking”.')).toBeInTheDocument();
  expect(screen.queryByText('−75 pts')).not.toBeInTheDocument();
  expect(api.deleteBehavior).toHaveBeenCalledWith(1);
});
