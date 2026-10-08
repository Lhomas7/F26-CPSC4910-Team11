import { fullName, initials } from './names';

test('initials uses the first two words of a name', () => {
  expect(initials('jamie lee rivera')).toBe('JL');
  expect(initials('  Driver  ')).toBe('D');
  expect(initials('')).toBe('?');
  expect(initials()).toBe('?');
});

test('fullName joins first and last name, falling back to the username', () => {
  expect(fullName({ first_name: 'Jamie', last_name: 'Rivera', username: 'jr' })).toBe(
    'Jamie Rivera',
  );
  expect(fullName({ first_name: 'Jamie', last_name: '', username: 'jr' })).toBe('Jamie');
  expect(fullName({ username: 'jr' })).toBe('jr');
});
