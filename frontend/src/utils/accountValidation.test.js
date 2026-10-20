import { unmetPasswordRequirements, validatePassword } from './accountValidation';

const LENGTH = 'Password must be at least 12 characters long.';
const LOWERCASE = 'Password must contain at least three lowercase letters.';
const UPPERCASE = 'Password must contain at least two uppercase letters.';
const NUMBERS = 'Password must contain at least two numbers.';
const SYMBOL = 'Password must contain at least one approved symbol.';
const IDENTITY = 'Password must not contain your username or email address.';

test('a password meeting every rule passes', () => {
  expect(unmetPasswordRequirements('abcdefAB12!x')).toEqual([]);
  expect(validatePassword('abcdefAB12!x')).toBeNull();
});

test('an empty password asks for one instead of listing rules', () => {
  expect(validatePassword('')).toBe('Enter a password.');
});

test('each rule is reported on its own when it is the only one unmet', () => {
  expect(unmetPasswordRequirements('abcdefAB12!')).toEqual([LENGTH]);
  expect(unmetPasswordRequirements('ABCDEFGHab12!')).toEqual([LOWERCASE]);
  expect(unmetPasswordRequirements('abcdefghiA12!')).toEqual([UPPERCASE]);
  expect(unmetPasswordRequirements('abcdefghAB1!x')).toEqual([NUMBERS]);
  expect(unmetPasswordRequirements('abcdefghAB12x')).toEqual([SYMBOL]);
});

test('every unmet rule is listed in order and met rules are left out', () => {
  // Meets the lowercase rule only.
  expect(unmetPasswordRequirements('abc')).toEqual([LENGTH, UPPERCASE, NUMBERS, SYMBOL]);
  expect(validatePassword('abc')).toBe([LENGTH, UPPERCASE, NUMBERS, SYMBOL].join(' '));
});

test('the username and email rule is listed alongside the others', () => {
  expect(unmetPasswordRequirements('jordanlee', { username: 'JordanLee' })).toEqual([
    LENGTH,
    UPPERCASE,
    NUMBERS,
    SYMBOL,
    IDENTITY,
  ]);
  expect(
    unmetPasswordRequirements('xxjordan@example.comAB12!', { email: 'Jordan@Example.com' }),
  ).toEqual([IDENTITY]);
});
