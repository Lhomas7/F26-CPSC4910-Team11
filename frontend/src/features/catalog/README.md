# Catalog frontend

The `/catalog` route is a foundation for Driver and Sponsor catalogs. It uses
the existing application shell, page header, and state panel. Administrators
can reach it through an eligible Driver/Sponsor View-As session, not as their
own account type. Server-side permissions remain mandatory when APIs are added.

The sidebar intentionally has no Catalog link yet. Direct navigation displays
an explicit not-yet-available panel without making a request or presenting fake
products, balances, empty results, or purchase controls.

`src/api/catalog.js` reads the first page of session-scoped GET `/api/catalog/`
through the shared HTTP client. The backend endpoint now exists; the placeholder
page intentionally remains disconnected until the catalog UI is ready. The
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
catalog response. Implement pagination and guidance states with the future UI.

Focused tests from `frontend`:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/app/CatalogRoute.test.jsx src/app/navigation.test.js src/api/catalog.test.js
```

## Shared product UI foundation

`components/` implements the Sponsor mockup's reusable card structure without
connecting the page or changing navigation yet:

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
mutation controls are included in this group. The route remains a placeholder
until the next integration group. These components are ready for later Sponsor
and Driver pages to consume without separate card implementations.

Focused component tests:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/features/catalog/components/ProductCard.test.jsx src/features/catalog/components/ClampedText.test.jsx
```

DOM tests cover rendering and interactions; real viewport measurements and
visual comparison belong to the page integration step, not a JSDOM claim.
