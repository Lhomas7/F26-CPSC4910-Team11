# SQLite and MySQL verification

SQLite supports convenient isolated development. MySQL 8.4 is the integration
target matching the shared RDS server's major/minor version. Passing SQLite
tests alone does not verify MySQL locking, collation, or schema behavior.

## CI coverage

| Check | SQLite job | Disposable MySQL 8.4 job |
| ----- | ---------- | ------------------------ |
| Missing migrations and fresh schema installation | Yes | Yes |
| Applied migration state | Yes | Yes |
| Full Django test suite | Yes | Focused contract/API suite |
| Upgrade from both historical Sprint 5 branches | Isolated historical databases | Not yet covered |
| Points constraint, rollback, indexes, timestamps, ordering | Yes | Yes |
| Application case-insensitive username/email rejection | Yes | Yes |
| Driver/MFA phone encryption | Yes | Yes |
| Administrator account creation and View-As eligibility/lifecycle | Yes | Yes |
| Sponsor scope, Driver linking, and point-adjustment API | Yes | Yes |
| Concurrent deductions using database row locks | Skipped: no row locking | Yes |

The existing SQLite job remains the broad regression signal. The new
`Backend compatibility (MySQL 8.4)` job starts a fresh service container and
schema on GitHub's runner, installs dependencies, applies migrations, and runs
selected tests. It does not connect to AWS or use RDS credentials. The public
CI-only root credential exists only for that disposable service, including
Django test-database creation; it must never be reused for an application or
shared database.

Deployment depends on the MySQL job in addition to the existing backend,
frontend, and secret checks. If branch protection is configured, also select
this job as a required pull-request check in GitHub's repository rules.

## Tested contracts

`accounts.tests.test_database_compatibility` verifies:

- The database rejects zero-value ledger entries.
- Rolling back an adjustment preserves balance and suppresses its post-commit
  notification callback.
- Equal history timestamps sort deterministically by descending primary key.
- Datetimes returned through the ORM are timezone-aware.
- Registration validation rejects case variants of an existing username/email.
- Composite ledger indexes exist with the expected columns.
- Two concurrent 75-point deductions against a 100-point balance yield one
  accepted entry, one insufficient-balance error, and a final balance of 25.

The concurrency case uses independent connections and committed fixture rows.
It runs only on engines with `select_for_update` support. SQLite ignores that
locking request and cannot substantiate this concurrency guarantee. The tests
do not add a case-insensitive database constraint: application-level duplicate
validation and the actual MySQL collation are distinct concerns.

## Local verification

From `backend` with its environment active and SQLite explicitly selected:

```text
python manage.py test accounts.tests.test_database_compatibility --noinput
```

For MySQL integration, use the CI service or a separately provisioned disposable
local schema. Django creates and destroys a test database, so never aim these
commands at the shared RDS application schema. A disposable test user must be
able to create and drop its test database. This document does not provide a
command that switches a developer's existing `.env` to shared MySQL.

## Remaining limits

- This change does not verify the current contents or migration history of RDS.
- Historical populated MySQL upgrade paths remain separate work; the new job
  verifies fresh MySQL migrations and populated SQLite upgrades.
- MySQL's default service collation may differ from RDS. Audit the deployed
  schema's collation before relying on accent/case equivalence beyond the
  tested application checks.
- The focused MySQL suite does not replace the full SQLite regression suite
  or prove parity for every endpoint.
- Native macOS setup and local MySQL build prerequisites still need teammate
  verification.

The MySQL job must pass on GitHub before this change is described as verified
against MySQL. Local SQLite results are not evidence that the new MySQL job
has already passed.
