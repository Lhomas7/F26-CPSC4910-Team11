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
