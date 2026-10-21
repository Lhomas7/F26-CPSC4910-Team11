# Catalog backend

This app owns sponsor-scoped reward catalog behavior. The first implementation
group establishes access helpers only; it exposes no endpoints and introduces
no product models or migrations.

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
- Driver scope resolution preserves pending/approved status. It does not grant
  browsing eligibility: that policy must be decided and enforced before an
  endpoint is exposed. Drivers without a sponsor receive `sponsor_required`.

Product source, image storage, pricing/conversion, and inventory behavior remain
undecided. Do not treat this access foundation as a decision on those contracts.

## Focused verification

From `backend`, with the virtual environment active and `DB_ENGINE=sqlite`:

```text
python manage.py test catalog.tests.test_access --noinput
```

The suite covers organization isolation, missing relationships, role and MFA
checks, inactive accounts, and effective identities through View-As middleware.
