// Keep these client-side checks aligned with backend/accounts/input_cleaning.py.
// The backend remains authoritative because browser validation can be bypassed.
export const EMAIL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._%+-]*@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;
export const NAME_PATTERN = /^[A-Za-z\u00C0-\u017F]+(?:[ '.-][A-Za-z\u00C0-\u017F]+)*$/;
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

const RESERVED_USERNAMES = new Set(['admin', 'root', 'support', 'null', 'undefined']);
const APPROVED_SYMBOLS = /[!@#$%^&*()\-_+.]/;

export function validateName(value, label) {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return `Enter your ${label}.`;
  if (cleaned.length > 50) return `${label[0].toUpperCase() + label.slice(1)} must be 50 characters or fewer.`;
  if (!NAME_PATTERN.test(cleaned)) return `${label[0].toUpperCase() + label.slice(1)} contains unsupported characters or separators.`;
  return null;
}

export function validateEmail(value) {
  if (!value.trim()) return 'Enter your email address.';
  if (value.trim().length > 254 || !EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address with a complete domain.';
  return null;
}

export function validateUsername(value) {
  const cleaned = value.trim();
  if (!cleaned) return 'Enter a username.';
  if (!USERNAME_PATTERN.test(cleaned)) return 'Username must be 3 to 30 characters using letters, numbers, periods, dashes, or underscores.';
  if (RESERVED_USERNAMES.has(cleaned.toLowerCase())) return 'Choose a different username.';
  return null;
}

export function validatePassword(password, { username = '', email = '' } = {}) {
  // Count each character group separately so feedback identifies the unmet rule.
  if (!password) return 'Enter a password.';
  if (password.length < 12) return 'Password must be at least 12 characters long.';
  if ((password.match(/[a-z]/g) || []).length < 3) return 'Password must contain at least three lowercase letters.';
  if ((password.match(/[A-Z]/g) || []).length < 2) return 'Password must contain at least two uppercase letters.';
  if ((password.match(/[0-9]/g) || []).length < 2) return 'Password must contain at least two numbers.';
  if (!APPROVED_SYMBOLS.test(password)) return 'Password must contain at least one approved symbol.';
  const foldedPassword = password.toLowerCase();
  if ([username, email].some((identity) => identity.trim() && foldedPassword.includes(identity.trim().toLowerCase()))) {
    return 'Password must not contain your username or email address.';
  }
  return null;
}
