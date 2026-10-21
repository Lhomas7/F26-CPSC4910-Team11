# Catalog frontend

The `/catalog` route supports Sponsor browsing and a Driver placeholder. It uses
the existing application shell, page header, and state panel. Administrators
can reach it through an eligible Driver/Sponsor View-As session, not as their
own account type. Server-side catalog permissions remain mandatory.

The sidebar now includes Catalog for Sponsors only. Drivers still see the
not-yet-available placeholder on direct navigation and have no Catalog link
until their separate UI group. Sponsor cards use real API data; there are no
fake products or purchase controls. Add Product and availability controls will
be connected in their own commit groups, not exposed as dead buttons here.

`src/api/catalog.js` reads session-scoped GET `/api/catalog/` through the shared
HTTP client. `getCatalog(page = 1)` only accepts positive safe-integer page
numbers, never browser-supplied organization IDs or arbitrary pagination URLs.
Malformed successful responses are errors, not successful empty catalogs. The
backend defines manually entered products with HTTPS image URLs and USD prices,
and permits approved, sponsor-linked Drivers only (or Sponsors managing their
organization). The placeholder is not a browsing grant.

Responses contain `count`, `next`, `previous`, `results`, `sponsor`,
`point_balance`, and `pricing`. The backend supports `page` and `page_size`
(default 25, maximum 100). Conversion remains unconfigured, so `pricing.status`
is `unconfigured`, and product `point_cost`/`can_afford` are null. Do not coerce
these to zero/false or imply redemption is ready. Keep manual `is_available`
independent from unknown affordability. Pending and unassigned Drivers receive
403 with `driver_not_approved` or `sponsor_required` codes rather than an empty
catalog response. Driver guidance remains part of the future Driver UI group.

## Sponsor browsing

`pages/SponsorCatalogPage.jsx` renders the mockup's organization heading,
neutral pricing notice, product grid, empty/loading/error states, and paginated
results. It includes a Refresh catalog action while the Add Product action is
pending. `CatalogPagination` uses a fixed page size of 25 and tracks the page
in the browser URL so refresh and Back work. It does not assume the API returns
`page` or `page_size` fields. Counts/ranges describe the products actually loaded.

`hooks/useCatalogPage.js` reuses `useApiRequest`. A transient same-identity
refresh failure keeps the previous products, labeled as previously loaded data.
While changing pages, prior content retains its own page label and controls are
disabled. A 404 above page 1 tries page 1 once, replaces the URL on success, and
reuses that response rather than requesting it again. A failed recovery is a
real error; it cannot loop. Invalid URL page numbers normalize to page 1.

The `CatalogPage` wrapper keys the Sponsor view by effective identity,
organization, and View-As metadata. A change clears prior cards synchronously;
late responses from the unmounted view cannot repopulate them. Access/session
errors (401/403/409) also hide previously loaded data rather than presenting it
as a harmless refresh failure. No search, filter, sort, or conversion controls
are invented.

The shell adds a Catalog SVG icon and a phone-only scrollable navigation strip.
It does not change brand/topbar height or put overflow clipping around the
separate account menu. Sidebar/stacked-shell regression tests are included.

Focused tests from `frontend`:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/app/CatalogRoute.test.jsx src/app/navigation.test.js src/api/catalog.test.js
```

## Shared product UI foundation

`components/` implements the Sponsor mockup's reusable card structure:

- `ProductGrid`: list semantics, 0.7rem gaps, top-aligned cards, and a responsive
  `minmax(min(17rem, 100%), 1fr)` track minimum that cannot exceed content width.
- `ProductCard`: wrapped heading, shared availability badge, pricing and
  description, a role-specific footer slot, and local US 12-hour update time.
  The default product heading is h3; the page should supply an h2 Products
  heading. `headingLevel={2}` is available where the surrounding hierarchy differs.
- `ProductImage`: a 3:2 contained-image frame, lazy HTTPS images, and distinct
  missing/broken fallbacks. A new URL resets only that image's failure state.
- `ProductPricing`: US dollar display from the API decimal string, including
  zero, and explicit unconfigured point pricing. Malformed prices never become
  free products. No point conversion or affordability styling is invented.
- `ClampedText`: three-line descriptions with measured-overflow Show more/less,
  product-specific accessible labels, resize observation, and cleanup on unmount.

Each styled component has its own CSS file, scoped with `catalog-` classes and
existing design tokens. Shared `.card`, `.badge`, and `.button` styling is reused.
No mockup review controls, fake catalog data, purchase actions, or availability
mutation controls are included in the shared card group. Sponsor browsing now
consumes the components; Driver pages can reuse them without a separate card
implementation.

Focused component tests:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/features/catalog/components/ProductCard.test.jsx src/features/catalog/components/ClampedText.test.jsx
```

Sponsor integration tests:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/features/catalog/pages/SponsorCatalogPage.test.jsx src/api/catalog.test.js src/app/CatalogRoute.test.jsx src/app/navigation.test.js src/app/AppLayout.test.jsx
```

DOM tests cover rendering, interactions, and navigation, not real viewport
measurements. Check 1366px, 760px, 390px and intermediate widths in-browser against
the supplied HTML/WebP references; do not treat JSDOM as visual verification.
