# Admin reports and sponsor alerts

## Audit log (`/audit-log`, `GET /api/admin/audit-log/`)

Admins (MFA enrolled) pick a **start date** and **end date**; both days are included in
full (server time zone, UTC). Either can be left out for an open-ended range. Optional
`category` narrows it to sign-ins, point changes, driver membership, view-as sessions,
or administrator password resets, and `?export=csv` downloads the same selection
(up to 10,000 rows; cells that start like a spreadsheet formula are neutralized).

The log reads the records the app already keeps (`LoginAttempt`, `PointTransaction`,
`DriverStatusChange`, `AdminImpersonationEvent`, `AdminPasswordResetEvent`). A failed
sign-in for a username that matches no account is shown as "Unknown username", never the
text that was typed, because people sometimes type their password there. The JSON reply
carries `truncated: true` when more rows matched than were returned.

## Invoices (`/invoices`, `GET /api/admin/invoices/`)

Admins choose a sponsor, a **billing period start** and **end** (both required, inclusive,
at most 366 days). The invoice itemizes points that sponsor **awarded** in the period per
driver and prices them at the sponsor's `points_per_dollar` rate (rounded to the cent).
Points removed are listed for reference and are not credited. Nothing is stored; the same
period always regenerates the same invoice from the point ledger. If the business uses a
different billing basis (a flat fee, a percentage), change `build_invoice` in
`accounts/services/reports.py`.

## New-application alerts

When a driver becomes a pending application for a company, every active sponsor in that
company gets an in-app notification (category `driver_application`), and an email if they
turned sponsor email alerts on. This happens when a sponsor links a driver (the sponsor who
did it is skipped) and when an administrator assigns a driver to a company. The app has no
driver-initiated "apply" screen; any future one should call
`notify_sponsors_of_application` after saving the pending driver.
