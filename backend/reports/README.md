# Administrator sales reports

The `reports` app stores immutable completed-sale facts and exposes
Administrator-only sales summaries.

## Data contract

`CompletedSale` snapshots the Sponsor, Driver, gross USD amount, completion
time, and the project's one-percent share. The share is stored to four decimal
places so it remains exactly one percent of a two-decimal sale instead of being
rounded to cents per transaction. Historical reports never recalculate money
from mutable catalog prices, point conversion rates, or a Driver's current
Sponsor relationship.

The model is intentionally not a cart, checkout, order, or redemption workflow.
A future completion service should create one `CompletedSale` only after the
corresponding transaction succeeds. Until then, local demo seeding and Django
admin can provide development records.

## API

- `GET /api/reports/sales/options/` lists Sponsor choices. Add `sponsor_id` to
  list Drivers from one Sponsor.
- `GET /api/reports/sales/` requires `group_by=sponsor` or `group_by=driver`.
  Optional `sponsor_id` narrows either report. Optional `driver_id` is accepted
  only for a Driver report with a matching Sponsor.

Both endpoints require an active Administrator with enrolled MFA. The report
returns paginated grouped rows plus totals across the full filtered scope.

## Focused tests

```powershell
cd backend
$env:DB_ENGINE = "sqlite"
$env:DJANGO_DEBUG = "true"
python manage.py test reports.tests accounts.tests.test_seed_local_demo
```

