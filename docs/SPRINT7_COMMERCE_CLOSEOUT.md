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
| 28612 redeem points | Internal checkout, review guard, ledger deduction, item snapshots, sale record and recoverable receipt or cancellation | MySQL/browser smoke test |
| 28616 Driver point history | Existing history reused, refreshed after purchase | Confirm one purchase reason and deduction in UI |
| 28621 balance-change reason | Server reasons remain visible with local timestamps | Check long reasons and purchase reason in UI |
| 28627 external product API | Fake Store search, preview, import, ownership and duplicate handling | Full authenticated Sponsor import from deployment |
| 28635 current provider data | Explicit refresh, 24-hour stale flag, and hourly batch worker in Compose | Verify the worker on the deployed environment |
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
- [ ] After deploying, run `docker compose ps catalog-sync` and
  `docker compose logs --tail 50 catalog-sync` from the deployment directory.
  Compose starts the worker after the web service is healthy. It runs a batch
  immediately and waits an hour between runs. Each batch attempts up to 100
  Fake Store imports that were last refreshed more than 24 hours ago or have
  no sync timestamp. Check that stale imports receive a new sync timestamp.
- [ ] Interrupt a checkout, reload, and choose **Cancel unfinished purchase**.
  Verify that a committed attempt shows its receipt, or that a cancelled
  attempt keeps the cart intact and permits a new review.

## Known boundaries

Fake Store supplies demo data, not real inventory or external order fulfillment.
Checkout validates the saved catalog price against a signed review. It does not
make a live external-provider request during confirmation. Explicit/scheduled
sync updates that saved price and invalidates an older review when necessary.

An uncertain attempt can be resolved even after its review expires. Cancellation
and checkout take the same Driver lock. The server either returns the committed
receipt or records a cancellation that rejects any delayed checkout using that
key. The UI preserves the pending key until it receives a definitive result.

Latest receipts are retained in memory across drawer close. A pending key
survives refresh in sessionStorage, but a dismissed completed receipt has no
dedicated history screen. Free purchases create receipts and sales but no
zero-point ledger entry. Full database documentation still needs reconciliation
against a fresh live schema export; the Sprint 7 ERD supplement is source-based.
