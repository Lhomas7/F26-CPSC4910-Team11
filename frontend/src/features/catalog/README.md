# Catalog frontend

The `/catalog` route supports Sponsor browsing and a Driver placeholder. It uses
the existing application shell, page header, and state panel. Administrators
can reach it through an eligible Driver/Sponsor View-As session, not as their
own account type. Server-side catalog permissions remain mandatory.

The sidebar now includes Catalog for Sponsors only. Drivers still see the
not-yet-available placeholder on direct navigation and have no Catalog link
until their separate UI group. Sponsor cards use real API data; there are no
fake products or purchase controls. Sponsor availability controls and the
Add Product workflow at `/catalog/new` are connected to the existing API.

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
results. Its toolbar includes Refresh catalog and Add product actions; the
empty state also links to creation. `CatalogPagination` uses a fixed page size
of 25 and tracks the page
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

## Sponsor availability controls

`AvailabilityControl` occupies the shared card's footer slot. The action names
the product (for example, `Mark unavailable: Travel Mug`), becomes disabled and
busy while saving, and retains the last confirmed badge until success. An
immediate in-flight guard prevents duplicate submissions. Controls are disabled
while a catalog read is in progress, but separate cards can save independently.

`setProductAvailability(id, boolean)` uses the shared session/CSRF client and
sends only the availability boolean. It validates the returned product ID,
confirmed value, and update timestamp before changing UI state. Failed or
malformed responses never produce a success announcement. The page has one
polite live region for successful changes and updates the card in place.

Failures preserve the last confirmed value, not a claim that the server could
not have changed. Retry resends the same explicit boolean, rather than toggling
whatever value is displayed at retry time. A 404 replaces the mutation action
with Refresh catalog; a successful read clears obsolete failure feedback.
401/403/409 responses fail closed at page level and hide prior organization data.

Confirmed availability is reconciled with read timestamps, including server
microseconds: late old reads cannot revert a successful PATCH, while a newer
server read can supersede it. Only availability and its timestamp are overlaid;
an old mutation response cannot overwrite a newly read name, price, or other
product fields. Identity-scoped callbacks ignore completion after an account or
View-As switch. No automatic mutation retry or product editing is introduced.

Focused availability tests:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/features/catalog/components/AvailabilityControl.test.jsx src/features/catalog/utils/availability.test.js src/features/catalog/pages/SponsorCatalogPage.test.jsx src/api/catalog.test.js src/features/catalog/components/ProductCard.test.jsx
```

## Add Product workflow

`pages/AddProductPage.jsx` implements `/catalog/new`, restricted by
`PAGE_ROLES.catalogManage` to effective Sponsor accounts. Administrator View-As
uses the target Sponsor's session permissions, not administrator privileges.
`catalogIdentity` keys both creation and browsing so a changed account,
organization, or View-As session clears the previous form/data synchronously.

The form follows the supplied HTML: wide two-column fields/preview, fields first
on smaller screens, and responsive action buttons. It uses feature-scoped CSS,
existing tokens/buttons, shared `ProductImage`, and shared `ConfirmDialog`.
Fields are name, decimal-string USD price, optional description, optional HTTPS
image URL, and boolean availability. There is no owner selector, image upload,
quantity, or point-conversion field.

`utils/productInput.js` normalizes human text and validates client boundaries;
the backend remains authoritative. Validation links errors/hints to inputs and
focuses the first invalid field. Server field errors preserve all entered
values. A broken image preview does not prevent submission of a valid HTTPS
URL; the browser loads the preview and the server does not verify it.

`createProduct` uses the shared session/CSRF client and requires HTTP 201 with a
valid product record before treating creation as confirmed. The in-flight guard
prevents duplicate submits; fields, Cancel, and breadcrumb navigation are
disabled while saving. Native browser leaving/refresh gets a warning while the
form is dirty or saving. Explicit Cancel and the breadcrumb ask before
discarding dirty values; unrelated in-app sidebar/Back navigation is not a
global route-blocking mechanism. Drafts are not persisted across navigation or
refresh, and no automatic POST retries occur.

Network errors, server failures, or malformed creation confirmations preserve
the form and warn that the product may already exist. An explicit new-tab
catalog link lets the Sponsor check without losing the draft. A deliberate
resubmit can create a duplicate because there is no idempotency-key contract.
Access/session errors fail closed and remove the editable draft from view.
Late responses after an identity change or navigation cannot redirect the new
view or announce the old account's creation.

After confirmation, creation replaces the form route with Catalog page 1 and an
identity-bound, one-time success notice. The page reloads data, explains
alphabetical placement, and offers Add another product plus Dismiss. It does
not assume the newly created item must be on page 1. The next form starts blank;
no form values are cleared before creation is confirmed.

Focused creation tests:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/features/catalog/pages/AddProductPage.test.jsx src/features/catalog/utils/productInput.test.js src/api/catalog.test.js src/app/CatalogRoute.test.jsx src/features/catalog/pages/SponsorCatalogPage.test.jsx
```

## Shared product UI foundation

`components/` implements the Sponsor mockup's reusable card structure:

- `ProductGrid`: list semantics, 0.7rem gaps, top-aligned cards, and a responsive
  `minmax(min(17rem, 100%), 1fr)` track minimum that cannot exceed content width.
- `ProductCard`: wrapped heading, shared availability badge, pricing and
  description, and an explicit footer slot with no default management content.
  `viewer="driver"`, `pricing`, and `pointBalance` select points-first Driver
  presentation; the default Sponsor presentation keeps USD primary.
  The default product heading is h3; the page should supply an h2 Products
  heading. `headingLevel={2}` is available where the surrounding hierarchy differs.
- `ProductImage`: a 3:2 contained-image frame, lazy HTTPS images, and distinct
  missing/broken fallbacks. A new URL resets only that image's failure state.
- `SponsorProductFooter`: composes caller-supplied availability controls with
  a valid update timestamp in local US 12-hour time. Drivers omit the footer.
- `ProductPricing`: Sponsor USD-primary and server-calculated points-secondary;
  Driver points-primary with independent affordability feedback and no USD.
  No frontend conversion or rounding. Missing/malformed configured costs,
  invalid balances, and contradictory server verdicts produce unknown feedback,
  never a guessed free cost or affordability verdict. Explicit unconfigured
  pricing has smaller neutral text with no affordability line.
- `utils/pricing`: checks safe integer costs/balances and verdict consistency
  for both card treatment and text. Insufficient points use the page-background
  fill and muted price, not card-level opacity; unavailable products independently
  dim only the image. Description controls remain usable in either state.
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
