# Catalog UI verification

## Scope and evidence — October 21, 2026

The implementation uses the approved Sponsor and Driver Catalog HTML mockups as
visual references. Their review controls and fixture calculations are not part
of the application. The backend owns rate conversion and upward rounding.

Browser checks used the real React development app and application shell with
a disposable, loopback-only fixture API. No shared database, real account, or
production endpoint was used. Fixtures are test inputs, not evidence of live
database integration or authorization enforcement.

- Rendered Driver states checked in dark mode at **390, 760, and 1366 CSS px**:
  mixed availability/affordability, zero balance, exact balance, one point short,
  empty catalog, unconfigured pricing, inconsistent pricing, long content,
  pending approval, no sponsor, request failure, and loading. None produced
  page-level horizontal overflow. Populated grids had 1, 2, and 3 columns.
- Sponsor populated cards checked at **320, 390, 600, 760, and 1366 px**: no
  page-level overflow, compact badges, and update timestamps retained.
- Add Product checked at **320, 390, 760, and 1366 px**: no page-level overflow;
  fields/preview stack at narrow widths and have two columns on desktop.
- Keyboard Enter expanded and Space collapsed the description on an unavailable,
  unaffordable Driver reward. The narrow account menu remained accessible, and
  Escape closed it.
- Long organization subtitles now wrap/clamp to two lines within the existing
  fixed-height topbar. Full text remains in the DOM and the title attribute.

Column transitions depend on **available content width**, including whether
the browser reserves space for a vertical scrollbar. For example, the review
browser used one column at 600 px with a reserved scrollbar; do not force two
columns by violating the shared 17rem card minimum. No horizontal page scroll
is the invariant, not a browser-independent exact transition pixel.

Light-mode visual review, alternate browser rendering, browser zoom, and real
authenticated database integration remain manual checks. The browser pass above
does **not** claim every state was rendered in both themes. Automated component
tests verify behavior, not pixel layout or measured color contrast.

## State coverage

| State | Automated coverage | Rendered browser check |
| --- | --- | --- |
| All four availability/affordability combinations | Driver page and card tests | Dark, 3 widths |
| Exact balance / one point short / zero balance / zero-point reward | Driver page and card tests | Dark, 3 widths |
| Unconfigured pricing | Driver page and card tests | Dark, 3 widths |
| Empty catalog | Driver page tests | Dark, 3 widths |
| Multiple pages, URL and Back navigation | Driver and Sponsor page tests | Manual follow-up |
| Long product/organization text | Card and page tests | Dark, 3 widths |
| Missing/broken images and fallback isolation | Shared card tests | Dark, 3 widths |
| Loading and initial request failure | Driver page tests | Dark, 3 widths |
| Failed refresh preserves same-identity data with stale warnings | Driver page tests | Manual follow-up |
| Out-of-range page recovers once / failed recovery does not loop | Driver and Sponsor page tests | Manual follow-up |
| Invalid cost, missing verdict, contradictory affordability | API, card, and page tests | Dark, 3 widths |
| Pending / no sponsor guidance | Driver page tests | Dark, 3 widths |
| Identity and View-As changes clear balance/products; late responses ignored | Driver and Sponsor page tests | Manual follow-up |
| Session/access denial clears data and cannot resurrect it via query changes | Driver page tests | Manual follow-up |

## Manual review before demo or merge

Use the normal local development setup, review the selected database, and apply
pending migrations through the project's migration workflow. Never use shared
administrator credentials as a normal application account. Use approved linked
Drivers and Sponsors with the required MFA configuration.

1. Open `/catalog` as a Sponsor, then as an approved linked Driver. Confirm the
   same organization-scoped products, with USD primary only for the Sponsor and
   points primary only for the Driver. Check the actual organization rate.
2. Repeat in both OS/browser color schemes at desktop, split-screen, and narrow
   widths, including 320 px. Check badges, header containment, contained images,
   price wrapping, focus outlines, and readable unaffordable cards. Only the
   unavailable image is opacity-dimmed; text and Show more remain usable.
3. Verify all four availability/affordability combinations. Equality is affordable;
   a zero-point product is affordable at zero balance. Availability stays separate.
4. Check long names, multiline descriptions, missing/broken images, and Show more
   using keyboard and pointer. No whole-card click target or purchase action exists.
5. With more than 25 products, use Next/Previous, refresh, and browser Back. Try an
   out-of-range page; recovery should happen once and update the URL to page one.
6. Simulate an initial outage and a later refresh failure using disposable test
   infrastructure. Only the latter may retain old data, clearly labeled stale.
7. Confirm pending/unassigned guidance has only Return home. Use test accounts to
   check access revocation, identity changes, and entering/leaving View-As. Prior
   products, balance, rate, and organization subtitle must disappear.
8. Regression-check Sponsor availability changes and Add Product validation,
   cancellation, failure preservation, and confirmed-success navigation.

No cart, quantity, checkout, redemption, sorting, or external-provider inventory
behavior is included in this review or in the Sprint 5 catalog implementation.

## Focused tests

From `frontend`, with dependencies installed:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/features/catalog/pages/DriverCatalogPage.test.jsx src/features/catalog/pages/SponsorCatalogPage.test.jsx src/features/catalog/components/DriverProductCard.test.jsx src/features/catalog/components/ProductCard.test.jsx src/features/catalog/components/ClampedText.test.jsx src/app/CatalogRoute.test.jsx src/app/navigation.test.js src/api/catalog.test.js
```

Backend pricing/access checks are documented in `backend/catalog/README.md`.
No production build, linter, or formatter is required for these focused tests.
