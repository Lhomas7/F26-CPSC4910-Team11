/** YYYY-MM-DD for a Date, in the browser's own calendar (what a date input shows). */
export function toInputDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysAgo(count, from = new Date()) {
  const result = new Date(from);
  result.setDate(result.getDate() - count);
  return result;
}

/** First and last day of the calendar month before `from`: the usual billing period. */
export function previousMonth(from = new Date()) {
  const first = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  const last = new Date(from.getFullYear(), from.getMonth(), 0);
  return { start: toInputDate(first), end: toInputDate(last) };
}

/** Returns a message when the range is unusable, otherwise ''. */
export function rangeProblem({ start, end }, { required = false } = {}) {
  if (required && (!start || !end)) return 'Choose both a start date and an end date.';
  if (start && end && end < start) return 'The end date must be on or after the start date.';
  return '';
}

/** "2026-10-01" -> "Oct 1, 2026" without letting the time zone shift the day. */
export function formatDay(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
