import { act, render, screen } from '@testing-library/react';

import ActiveViewAsIndicator from './ActiveViewAsIndicator';

const user = {
  name: 'Jamie Rivera',
  username: 'jamie.rivera',
  account_type: 'driver',
  company: 'Palmetto Freight',
  impersonation: {
    active: true,
    admin: { name: 'Kylie Gilbert', username: 'kylie.admin' },
    expires_at: '2026-10-09T16:10:00Z',
  },
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-09T16:00:00Z'));
});

afterEach(() => jest.useRealTimers());

test('shows a local expiration time and changes to the five-minute warning', () => {
  const expectedTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(Date.parse(user.impersonation.expires_at));

  render(<ActiveViewAsIndicator user={user} busy={false} error="" onReturn={jest.fn()} />);

  const indicator = screen.getByRole('region', { name: 'Viewing as another user' });
  expect(indicator).toHaveTextContent(`This session is recorded and ends at ${expectedTime}.`);

  act(() => jest.advanceTimersByTime(5 * 60 * 1000));

  expect(indicator).toHaveTextContent(
    `This recorded session ends in less than five minutes at ${expectedTime}.`,
  );
});
