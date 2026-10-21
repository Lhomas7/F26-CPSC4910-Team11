# Catalog backend

This app owns sponsor-scoped reward catalog behavior. It currently defines the
product model, initial migration, access helpers, and Sponsor mutation endpoints.
Catalog browsing endpoints and the product-management UI are not implemented yet.

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

No point cost or conversion rate is stored or calculated yet. A missing rate
must never be treated as zero cost or a guessed conversion. Cart, quantities,
redemption, orders, and live provider stock are outside this implementation.

The additive migration is `catalog.0001_initial`. Apply it through the normal
project migration workflow after reviewing the target environment. The tests
apply it only to disposable SQLite databases; no shared database was migrated
as part of this change.

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
not report a point cost while conversion is unconfigured. Shared View-As
middleware supplies the effective target identity; the real administrator does
not grant additional Sponsor privileges.

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
