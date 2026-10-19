/** Up to two uppercase initials from a display name, or '?' when it's blank. */
export function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

/** "First Last" for accounts that store split names, falling back to the username. */
export function fullName(account) {
  return `${account.first_name || ''} ${account.last_name || ''}`.trim() || account.username;
}
