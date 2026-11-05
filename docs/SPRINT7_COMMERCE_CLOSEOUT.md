# Sprint 7 commerce integration and closeout

## Integrated scope

The redemption branch now contains the provider catalog work, Ian's cart,
reviewed checkout, receipt recovery, and report integration. Published migration
names remain unchanged. `catalog.0005_merge_provider_redemption` joins both
histories; it has no schema operations of its own. No migration was applied to
AWS as part of this verification.

| Task | Repository result | Remaining verification |
| --- | --- | --- |
| 28607 point count updates | Home, Points, Catalog and cart refresh after checkout and on tab return | Actual browser/session verification; no continuous server push |
| 28612 redeem points | Internal checkout, review guard, ledger deduction, item snapshots, sale record and recoverable receipt | MySQL/browser smoke test; unresolved-attempt limitation below |
| 28616 Driver point history | Existing history reused, refreshed after purchase | Confirm one purchase reason and deduction in UI |
| 28621 balance-change reason | Server reasons remain visible with local timestamps | Check long reasons and purchase reason in UI |
| 28627 external product API | Fake Store search, preview, import, ownership and duplicate handling | Full authenticated Sponsor import from deployment |
| 28635 current provider data | Explicit product refresh, sync time, 24-hour stale flag, batch command | Schedule batch job if automatic refresh is required |
| 28638 API product information | Sponsor USD details and Driver converted point costs share catalog data | Final light/dark responsive review; Group B mockup refinements if desired |

These task mappings use the supplied planning IDs; this document does not update
DevOps states. Close tasks only after their relevant acceptance checks pass.

## Verification performed

- 129 catalog/report backend tests pass on disposable SQLite, including a full
  provider-import -> price-refresh -> changed-review -> confirmed-checkout ->
  replay/lookup -> administrator-report flow.
- A late completed-sale failure rolls back the point deduction, cart deletion,
  and redemption records. Later catalog edits do not change receipt/report money.
- The migration upgrade test preserves an existing manual reward through the
  combined migration graph. Django detects no missing migrations.
- 144 frontend tests pass across catalog routes, provider import, Sponsor/Driver
  catalog, cart/recovery, API validation, and reports.
- Tracked-file guard passes. No production build or linter was run.
- A live read-only call to Fake Store API using the actual provider client
  returned product ID 1. Its initial 403 was resolved by adding an identifying
  application User-Agent. No credentials or database were used for that request.
- Imported available products now use the same after-commit notification hook
  as manual creation. Duplicate imports do not notify again. A provider response
  with the wrong requested product identity is rejected.

## Before release

- [ ] Review the configured database target, back up as appropriate, inspect
  `python manage.py migrate --plan`, and apply the combined migrations on the
  intended environment. Verify `python manage.py migrate --check` afterward.
- [ ] Run CI, including the project's disposable MySQL job. SQLite success does
  not verify MySQL row-lock behavior under concurrent checkout requests.
- [ ] Using real authenticated accounts, search/import as a Sponsor, browse/add
  as its approved Driver, review/confirm once, and verify the receipt, balance,
  history, notification, and Administrator report's exact 1% share.
- [ ] Confirm organization isolation, pending/unassigned guidance, and read-only
  View-As controls. Recover the owning Driver's exact receipt after an
  organization change without exposing it to another Driver.
- [ ] Complete the responsive, keyboard, theme, and interruption checks in
  [the cart QA checklist](SPRINT7_CART_QA.md).
- [ ] Configure a scheduled `python manage.py sync_catalog_products --limit 100`
  job if periodic refresh is part of acceptance. The command selects imports
  older than 24 hours; a command existing in the repo is not a deployed schedule.

## Known boundaries

Fake Store supplies demo data, not real inventory or external order fulfillment.
Checkout validates the saved catalog price against a signed review. It does not
make a live external-provider request during confirmation. Explicit/scheduled
sync updates that saved price and invalidates an older review when necessary.

An uncertain attempt whose original review is lost/expired and whose receipt
cannot be found has no authoritative cancellation/resolution endpoint. The UI
preserves the key and blocks new purchases. Do not mark that outcome resolved by
clearing storage or claiming a 404 means the original request failed. Backend
resolution remains follow-up work before treating interrupted checkout as fully
recoverable in every case.

Latest receipts are retained in memory across drawer close. A pending key
survives refresh in sessionStorage, but a dismissed completed receipt has no
dedicated history screen. Free purchases create receipts and sales but no
zero-point ledger entry. Full database documentation still needs reconciliation
against a fresh live schema export; the Sprint 7 ERD supplement is source-based.
