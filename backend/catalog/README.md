# Catalog backend

This app owns sponsor-scoped reward catalog behavior. It currently defines the
product model, initial migration, access helpers, Sponsor mutation endpoints,
and session-scoped catalog browsing. Sponsor browsing, creation, and availability
controls and read-only Driver browsing are implemented in the frontend. See
`docs/SPRINT5_CATALOG_CLOSEOUT.md` for migration and final verification status.

## Access contract

- Pass the effective `request.user` to `sponsor_catalog_scope` or
  `driver_catalog_scope`. Do not substitute the real administrator during
  View-As.
- Helpers reuse the existing account-role and MFA permissions and reject
  inactive accounts. Ownership comes from server-side account relationships,
  never an organization ID supplied by the client.
- `CatalogScope.restrict(queryset)` filters records with a `sponsor` foreign
  key before individual lookups. Future product endpoints must use the scoped
  queryset for reads and updates and set ownership themselves on creation.
- Only approved, sponsor-linked Drivers can resolve a browsing scope. Pending
  Drivers receive `driver_not_approved`; Drivers without a sponsor receive
  `sponsor_required`.

## Product contract

`CatalogProduct` belongs to one `SponsorCompany` through the `sponsor` foreign
key. Products are manually entered for Sprint 5; no external shopping provider
is integrated yet.

| Field | Contract |
| --- | --- |
| `name` | Required, at most 200 characters; model validation trims surrounding whitespace |
| `description` | Optional, at most 5,000 characters |
| `image_url` | Optional HTTPS URL, at most 2,048 characters; no upload, fetch, or proxy |
| `price_usd` | Required nonnegative USD amount, up to 10 whole-number digits and 2 decimal places |
| `is_available` | Manual availability, default true; not provider inventory verification |
| `created_at`, `updated_at` | Server-maintained timestamps |

Missing or failed images will use a frontend fallback. HTTPS references prevent
mixed-content image URLs on the HTTPS deployment; URL validation does not prove
that a remote resource exists or is an image. Rendering must handle failures.

Negative prices and empty names have database check constraints. Description
length, URL rules, and whitespace normalization require model/API validation;
direct ORM `save()` does not automatically call `full_clean()`. The creation
service validates input and assigns sponsor ownership itself. Sponsor
deletion is protected while products exist.

`SponsorCompany.points_per_dollar` is the organization's catalog conversion rate,
defaulting to 100 for new and existing organizations. Whole-number values from
1 through 100,000 are enforced by model validators and a database constraint.
This bound keeps the largest supported product cost below JavaScript's safe
integer limit. Administratively update this field through validated Django ORM
code (`full_clean()` before `save()`) or the existing Django admin SponsorCompany
form. There is no public rate-editing endpoint or React rate-management UI in
this group.

Point costs are calculated on each catalog read using exact Decimal arithmetic:
`ceil(price_usd * points_per_dollar)`. For example, $24.95 costs 2,495 points at
100 points/$1 and 624 points at 25 points/$1. Zero dollars costs zero points.
Rate changes reprice the catalog without rewriting products, altering Driver
balances, creating ledger entries, or sending notifications. This rate describes
catalog prices, not cash redemption. Cart, quantities, redemption, orders, and
live provider stock are outside this implementation.

The additive migration is `catalog.0001_initial`. Apply it through the normal
project migration workflow after reviewing the target environment. The tests
apply it only to disposable SQLite databases; no shared database was migrated
as part of this change.

`accounts.0014_sponsor_catalog_rate` adds the rate and its constraint, supplying
100 for existing organizations without changing existing product prices. Review
and apply it through the normal migration workflow; no shared database was
migrated as part of this change.

## Sponsor API

Both endpoints require an active Sponsor account satisfying the existing MFA
policy. Session authentication retains CSRF protection. Responses are not cached.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/sponsor/catalog/products/` | Create a manually entered product (201) |
| PATCH | `/api/sponsor/catalog/products/<id>/availability/` | Set manual availability (200) |

Creation accepts required `name` and `price_usd`, plus optional `description`,
`image_url`, and `is_available`. Send monetary amounts as decimal strings such
as `"12.50"`. Availability must be a JSON boolean (`true` or `false`). Names use
the shared Unicode/whitespace normalization; descriptions preserve paragraphs
while normalizing Unicode and line endings. Unknown fields, including ownership
IDs, calculated point costs, and provider identifiers, are rejected with 400.

The availability action accepts only `is_available`. It scopes before lookup,
locks the owned product, and updates only availability and its timestamp.
Another organization's product and a nonexistent ID both return 404. Repeating
the current value is a no-op. Sponsors in the same organization share ownership.
There is no arbitrary edit, delete, or inventory-count endpoint.

Both actions return `id`, `name`, `description`, `image_url`, `price_usd`,
`is_available`, `created_at`, and `updated_at`. The serializer deliberately does
not report derived pricing on mutation responses; refresh the catalog to read
the current rate and point costs. Shared View-As
middleware supplies the effective target identity; the real administrator does
not grant additional Sponsor privileges.

## Catalog browsing API

`GET /api/catalog/` resolves the effective user's organization on the server.
Sponsors receive their organization's products. Drivers must be active,
approved, sponsor-linked, and compliant with any required MFA policy.
Administrators cannot browse as themselves; eligible View-As sessions use the
target's role and organization.

The response contains:

| Field | Meaning |
| --- | --- |
| `count`, `next`, `previous`, `results` | Standard page-number pagination, scoped before counting |
| `sponsor` | The resolved organization's `id` and `name` |
| `point_balance` | The Driver's existing ledger-derived balance; null for Sponsors |
| `pricing` | `{"status": "configured", "points_per_dollar": 100}` with the organization's current rate |

Each result contains the product fields returned by the Sponsor API, plus
`point_cost` (nonnegative whole points) and `can_afford` (a boolean for Drivers,
null for Sponsors). A Driver can afford a product exactly when their ledger
balance is greater than or equal to its point cost, including equality and
zero-cost products at zero balance. Manual `is_available` is independent of
affordability. Unavailable products remain visible. The current backend always
provides configured pricing; clients must still distinguish unknown or malformed
pricing from zero cost and must not invent an affordability verdict.

Supported parameters are `page` and `page_size`. Default page size is 25 and
the maximum is 100; results are ordered by name and then ID. Out-of-range pages
return 404. Other query parameters, including sponsor/Driver IDs and submitted
balances, return 400. DRF pagination defaults apply to invalid page sizes.

An empty catalog is a successful response with organization context and no
results. Pending or unassigned Drivers instead receive 403 with a `code` of
`driver_not_approved` or `sponsor_required`, respectively. Other authorization
denials retain their service code (such as `inactive_account`) or use
`permission_denied`. Request/database failures must
not be converted into successful empty catalogs by clients. Responses are not
cached. Browsing never creates a point transaction or notification.

## Focused verification

From `backend`, with the virtual environment active and `DB_ENGINE=sqlite`:

```text
python manage.py test catalog.tests --noinput
```

The suite covers organization isolation, missing relationships, role and MFA
checks, inactive accounts, and effective identities through View-As middleware.
It also checks product validation/database constraints and the initial migration
against an isolated schema with an existing sponsor.
Sponsor API tests cover validation/normalization, same-company collaboration,
ownership spoofing, cross-organization IDs, CSRF, and real View-As sessions.
Browsing tests cover paginated isolation/counts, unavailable/empty catalogs,
ledger balances, default/custom rates, upward rounding, zero costs, affordability
boundaries, migration defaults, rate constraints, pending/unassigned guidance,
authentication/MFA rules, and both View-As roles.
