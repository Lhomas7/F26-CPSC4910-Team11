# RC#2 multiple sponsors per driver: manual QA

A checklist for the multi-sponsor requirements change. Each item checks one
acceptance criterion from `RC2-us.md`. Run it against a local database seeded
with `python dev.py seed` (see `LOCAL_OFFLINE_DEVELOPMENT.md`):

- `jamie.rivera` is approved by Palmetto Freight (85 points) and Upstate
  Logistics (250 points).
- `priya.nair` has a pending application to Palmetto Freight.
- `unlinked.driver` has no sponsors.
- `pat.sponsor` manages Palmetto Freight and `casey.sponsor` manages Upstate
  Logistics.

The automated coverage for each area is listed after its checklist.

## Driver applies to multiple sponsors

- [ ] Register a new driver and check two sponsors. After sign-in, Home and
      **My sponsors** show both as **Pending approval**.
- [ ] Register a driver without checking any sponsor. Sign-up still succeeds,
      and Home offers **Apply to a sponsor**.
- [ ] As `unlinked.driver`, apply to a sponsor from **My sponsors**. It shows
      as pending, and that sponsor gets a "driver applied" notification.
- [ ] As `pat.sponsor`, approve one application, and as `casey.sponsor`,
      reject another with a reason. Each sponsor's status changes on its own.
- [ ] **My sponsors** never offers a sponsor the driver is already pending or
      approved with. A sponsor that rejected or removed the driver is offered
      again, and applying reopens the same membership as pending.
- [ ] Drivers who existed before the change keep their sponsor and status.
      This is covered by `drivers/test_migrations.py`.

Automated: `drivers/test_driver_sponsors.py`, `LoginPage.test.jsx`, and
`MySponsorsPage.test.jsx`.

## Driver views points by sponsor and switches sponsors

- [ ] As `jamie.rivera`, Home shows Palmetto Freight 85 and Upstate Logistics
      250 as separate cards. No combined total appears anywhere.
- [ ] The sidebar **Shopping with** menu lists both sponsors with their own
      balances. Switching changes the catalog, cart, Points, and Purchases.
- [ ] Reload the page after switching: the chosen sponsor is still active.
- [ ] A driver with a single approved sponsor sees it named in the sidebar,
      with nothing to switch.

Automated: `SponsorSwitcher.test.jsx`, `WelcomePage.test.jsx`, and
`catalog/tests/test_active_sponsor_scoping.py`.

## Driver redeems points only within one sponsor

- [ ] The catalog shows only the active sponsor's rewards, and affordability
      uses only that sponsor's balance.
- [ ] Add a Palmetto reward, switch to Upstate: the cart hides it. Switch back:
      it is still there. The cart drawer says which sponsor's points it spends.
- [ ] With too few Palmetto points for the cart, checkout is refused even
      though Upstate points would cover it. Neither balance changes.
- [ ] A successful purchase deducts only from the sponsor shopped with.
- [ ] Switching is unavailable while a purchase is being submitted or recovered.

Automated: `catalog/tests/test_active_sponsor_scoping.py` and
`CartRecovery.test.jsx`.

## Sponsor manages only its own drivers

- [ ] As `pat.sponsor`, the driver list, driver detail, points, purchases, and
      reports include only Palmetto Freight's drivers and points.
- [ ] Jamie's detail page as `pat.sponsor` shows only Palmetto's status,
      balance, and history, and never mentions Upstate Logistics.
- [ ] Approve `priya.nair`. Rejecting an application requires a reason, and
      the reason appears in the admin's status history for that driver.
- [ ] Dropping Jamie from Palmetto leaves the Upstate membership approved.
- [ ] Request `/api/sponsor/drivers/<id>/` for a driver outside the
      organization: the response is 404.

Automated: `drivers/tests.py` (`MultiSponsorIndependenceTests` and the
removal tests) and `DriverDetailPage.test.jsx`.

## Admin views and assigns a driver's sponsors

- [ ] As `demo.admin`, open Jamie under **Users**. The **Sponsors** panel lists
      each membership with its status and balance.
- [ ] Add `unlinked.driver` to two sponsors. Both are approved immediately,
      and the history shows "Added by an administrator".
- [ ] Remove one sponsor with a reason. Only that membership changes, and the
      history records the removal and its reason.
- [ ] **Add user** for a driver with several sponsors checked creates the
      account already approved in each of them.
- [ ] The **Users** list shows every active sponsor for a driver and filters
      by any one of them.

Automated: `accounts/tests/test_admin_users.py`,
`DriverAccountPage.test.jsx`, `AddUserPage.test.jsx`, and
`AdminUsersPage.test.jsx`.
