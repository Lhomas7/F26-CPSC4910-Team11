import { daysAgo, formatDay, previousMonth, rangeProblem, toInputDate } from './dates';

test('previousMonth is the whole calendar month before today', () => {
  expect(previousMonth(new Date(2026, 9, 29))).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  expect(previousMonth(new Date(2026, 0, 5))).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  expect(previousMonth(new Date(2028, 2, 10))).toEqual({ start: '2028-02-01', end: '2028-02-29' });
});

test('toInputDate and daysAgo use the local calendar day', () => {
  expect(toInputDate(new Date(2026, 0, 9))).toBe('2026-01-09');
  expect(toInputDate(daysAgo(30, new Date(2026, 9, 29)))).toBe('2026-09-29');
});

test('rangeProblem explains an unusable range', () => {
  expect(rangeProblem({ start: '2026-10-01', end: '2026-10-31' })).toBe('');
  expect(rangeProblem({ start: '2026-10-01', end: '2026-10-01' })).toBe('');
  expect(rangeProblem({ start: '2026-10-31', end: '2026-10-01' })).toMatch(/on or after/);
  expect(rangeProblem({ start: '', end: '2026-10-01' }, { required: true })).toMatch(/both/);
  expect(rangeProblem({ start: '', end: '' })).toBe('');
});

test('formatDay does not shift the day across time zones', () => {
  expect(formatDay('2026-10-01')).toContain('1');
  expect(formatDay('')).toBe('');
});
