# Catalog backend

This app owns sponsor-scoped reward catalog behavior. It currently defines the
product model, initial migration, and access helpers. It exposes no endpoints yet.

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
direct ORM `save()` does not automatically call `full_clean()`. Future creation
endpoints must validate input and assign sponsor ownership themselves. Sponsor
deletion is protected while products exist.

No point cost or conversion rate is stored or calculated yet. A missing rate
must never be treated as zero cost or a guessed conversion. Cart, quantities,
redemption, orders, and live provider stock are outside this implementation.

The additive migration is `catalog.0001_initial`. Apply it through the normal
project migration workflow after reviewing the target environment. The tests
apply it only to disposable SQLite databases; no shared database was migrated
as part of this change.

## Focused verification

From `backend`, with the virtual environment active and `DB_ENGINE=sqlite`:

```text
python manage.py test catalog.tests --noinput
```

The suite covers organization isolation, missing relationships, role and MFA
checks, inactive accounts, and effective identities through View-As middleware.
It also checks product validation/database constraints and the initial migration
against an isolated schema with an existing sponsor.
