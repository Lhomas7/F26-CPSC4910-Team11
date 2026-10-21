# Catalog frontend

The `/catalog` route is a foundation for Driver and Sponsor catalogs. It uses
the existing application shell, page header, and state panel. Administrators
can reach it through an eligible Driver/Sponsor View-As session, not as their
own account type. Server-side permissions remain mandatory when APIs are added.

The sidebar intentionally has no Catalog link yet. Direct navigation displays
an explicit not-yet-available panel without making a request or presenting fake
products, balances, empty results, or purchase controls.

`src/api/catalog.js` reserves a session-scoped GET `/api/catalog/` boundary using
the shared HTTP client. The endpoint does not exist yet; the page must not call
it until backend integration is ready. Product fields, pricing, image handling,
pagination, and pending-Driver eligibility remain undecided.

Focused tests from `frontend`:

```text
npm test -- --watchAll=false --runInBand --runTestsByPath src/app/CatalogRoute.test.jsx src/app/navigation.test.js src/api/catalog.test.js
```
