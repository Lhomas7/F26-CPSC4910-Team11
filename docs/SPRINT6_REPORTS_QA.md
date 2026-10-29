# Sprint 6 Reports verification

## Browser checks performed

The actual React `/reports` page was served on an isolated development port
using fictional API responses. No database or real account was used.

- Dark-mode populated Sponsor report inspected at 1366, 760, 390, and 320px.
- Document scroll width matched document client width at all four widths.
- A long Sponsor name wrapped inside the result card.
- Searchable Sponsor dropdown stayed within the 320px viewport.
- Large gross totals and four-decimal project shares rendered visibly.
- Explicit Run report displayed results and the submitted scope.

The review led to two presentation adjustments: an accent-colored project-share
value and an explicit whole-scope note beneath Gross sales.

## Still to verify

- Light-mode browser appearance.
- Browser loading, error, retry, empty, multi-page and Driver report scenarios.
- Keyboard traversal and screen-reader behavior across the complete workflow.
- Real authenticated accounts, MySQL migration, and real completed-sale data.
- Purchase completion creating a sale automatically; no checkout integration
  exists in the current reporting implementation.

Focused automated page tests separately cover scope persistence, pagination,
retry, denied access, and account changes. They are not proof of visual parity.
