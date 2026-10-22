function timestampVersion(value) {
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) return '';
  // Preserve server microseconds when comparing snapshots inside one millisecond.
  // DRF emits UTC ISO timestamps, with an optional fractional seconds component.
  const fraction = /\.(\d+)(?:Z|[+-]\d\d:\d\d)$/.exec(value)?.[1] || '';
  return `${new Date(milliseconds).toISOString().slice(0, 19)}.${fraction.padEnd(6, '0')}`;
}

export function withConfirmedAvailability(product, update) {
  if (!update || update.id !== product.id) return product;
  // An in-flight read can arrive after PATCH with an older snapshot. Preserve
  // the confirmed update then, but let a newer server read win. Do not overwrite
  // unrelated fields such as the name or price with an older mutation response.
  const updateVersion = timestampVersion(update.updated_at);
  if (!updateVersion || updateVersion < timestampVersion(product.updated_at)) return product;
  return { ...product, is_available: update.is_available, updated_at: update.updated_at };
}
