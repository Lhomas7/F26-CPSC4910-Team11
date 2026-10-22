# Sprint 5 catalog closeout

## DevOps wording corrections

Copy these into the existing work items. These clarify the approved design;
they do not add cart, checkout, redemption, or rate-management UI scope.

### Task 27482 — Create the sponsor catalog product data model

Replace the description with:

> Store sponsor organization, product name, description, HTTPS image URL,
> nonnegative USD price, manual availability, and timestamps. Derive whole-point
> cost from the organization's current points-per-dollar rate using Decimal
> arithmetic and upward rounding. Do not persist a duplicate point price or
> change Driver balances when a catalog conversion rate changes.

### Task 27512 — Keep unavailable rewards read-only and clearly identified

Replace the title above and use this description:

> Keep unavailable rewards visible with an Unavailable status and dimmed image.
> Do not expose purchase, quantity, cart, checkout, or redemption controls in
> the Sprint 5 read-only Driver catalog. Keep Show more/Show less usable.
> Availability and affordability must remain independent.

### Task 27513 — Test unavailable-reward indicators and read-only behavior

Replace the title above and use this description:

> Verify available/unavailable indicators independently of affordability.
> Confirm unavailable Driver cards expose no purchase links, quantity inputs,
> or redemption controls, while description expansion remains keyboard and
> pointer accessible. Do not disable Show more simply because a reward is
> unavailable or unaffordable.

## Completion evidence and outstanding checks

| Item | Evidence / condition for closing |
| --- | --- |
| 27482 model design | `backend/catalog/models.py`, `backend/catalog/pricing.py`, and `accounts.SponsorCompany.points_per_dollar`; update the description above |
| 27483 create and apply migration | Migration files and disposable SQLite migration tests exist. Confirm application of `catalog.0001_initial` and `accounts.0014_sponsor_catalog_rate` on the intended database before closing |
| 27509 zero, positive, large cost display | `DriverProductCard.test.jsx` covers zero/positive boundaries and the maximum supported cost, 999,999,999,999,000 points, at equality, one point short, and zero balance |
| 27512–27513 unavailable actions | Driver cards omit purchase/quantity/redemption actions; focused tests verify the remaining description control stays enabled. Update the task wording above |
| Real database/browser smoke test | Verify with actual Sponsor and approved linked Driver accounts; fixture-only browser checks do not satisfy this |
| Light-mode review | Follow `CATALOG_QA.md`; existing rendered browser evidence covers dark mode only |

The board is updated manually by Kylie. This document does not claim those work
items are closed or that migration/integration checks have succeeded merely
because the implementation or test files exist.

## AWS migration handoff

The configured target was inspected: MySQL database `Team11_DB` on the class
AWS RDS host. Kylie confirmed AWS is the intended target. The connection attempt
outside the network sandbox failed during the initial MySQL handshake (error
2013), before Django could read migration history. No migration was applied,
no database data was changed, and application status is still unverified.

Run these in PowerShell using the normal backend environment; do not set
`DB_ENGINE=sqlite` for this check:

```powershell
cd "C:\Users\missk\CPSC 4910\F26-CPSC4910-Team11\backend"
.\venv\Scripts\Activate.ps1
python manage.py shell -c "from django.conf import settings; d = settings.DATABASES['default']; print(d['ENGINE'], d['NAME'], d.get('HOST', ''))"
python manage.py migrate --plan
```

Confirm the printed target is the intended MySQL `Team11_DB`, then review/share
the migration plan before executing it. Do not use `--fake`, manually create
Django-managed tables, or discard migration history to bypass a connection or
schema problem. After the plan is approved, apply migrations with the normal
`python manage.py migrate` command, and confirm with
`python manage.py migrate --check` and
`python manage.py showmigrations accounts catalog`.

This manual handoff is necessary because connection failure does not establish
which migrations are already applied or whether other pending migrations exist.
The real-account smoke test and light-mode visual check remain open until their
results are recorded; do not mark the entire sprint complete based on test counts.
