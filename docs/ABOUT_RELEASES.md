# About-page release metadata

The checked-in `backend/about_page/release_metadata.json` is the source for
reviewed, published release metadata imported into the About database. It
currently contains versions `0.1.0` through `0.6.0`.

Git tags and GitHub Releases preserve repository snapshots. This metadata
controls the information shown by `/api/about/`; it does not create tags,
publish GitHub Releases, or deploy code.

## Import the reviewed metadata

After applying migrations, run from `backend` with its environment active:

```text
python manage.py seed_about_page
```

On an isolated SQLite database with Debug enabled, this imports missing exact
versions from the checked-in file. Identical versions are left unchanged,
including their timestamps. Existing metadata that differs stops the entire
import; no partial changes are committed.

For a shared MySQL or non-debug environment, inspect the selected target using
`doctor --check-database`, then explicitly acknowledge the import:

```text
python manage.py seed_about_page --allow-shared-db
```

To apply a reviewed correction to an existing exact version:

```text
python manage.py seed_about_page --update
```

Shared environments additionally require `--allow-shared-db`. Do not use
`--update` merely to suppress a conflict: review whether an Administrator
edited the record through the UI, and reconcile that edit with the metadata
file first.

## Metadata format and validation

The file is a nonempty JSON array of records with exactly these fields:

```json
[
  {
    "team_number": 11,
    "version_number": "0.5.0-dev.84",
    "release_date": "2026-10-20",
    "product_name": "Good Driver Incentive Program",
    "product_description": "Description of this specific development snapshot."
  }
]
```

This is a format example, not a claim that a final Sprint 5 release exists.
Versions must be concrete Semantic Versions without the Git tag's `v` prefix.
Development and release-candidate identifiers are allowed; ranges such as
`0.4.x` and labels such as `Sprint 5` are not valid new catalog versions.
Team numbers must be positive, dates must be valid `YYYY-MM-DD` strings, and
product text must be nonempty and fit model field limits. Duplicate versions
within one file are refused.

Import another reviewed JSON file with:

```text
python manage.py seed_about_page --file path/to/release_metadata.json
```

Use the same reviewed input for fresh and existing databases to produce the
same canonical release records. Historical migrations remain unchanged and
may retain older `Sprint 1` or `Sprint 3` labels; the importer neither deletes
nor rewrites those legacy records. It does not renumber migrations or replace
the database. Canonical imported versions and legacy aliases may coexist.

## Release dates and current selection

The About API selects the greatest release date, then the most recently
updated record; it does not sort semantic versions. Avoid importing future
dates unless the release should already be shown.

The catalog uses the demo/completion dates verified for this repository:

- `0.1.0`: September 17, 2026.
- `0.2.0`: September 24, 2026.
- `0.3.0`: October 1, 2026.
- `0.4.0`: October 9, 2026, with the October 8 demo recorded in its description.
- `0.5.0`: October 22, 2026.
- `0.6.0`: October 29, 2026.

For each future accepted release, add a new exact version to the metadata file
in the release PR, review it with the team, and run the import against the
intended environment after migrations. Automatic deployment import is not
enabled by this change.

## Local demonstration data

`seed_local_demo --with-about` remains a separate, SQLite/debug-only option.
It adds a `Local demo` record and never edits official sprint history. A newer
local demo date can make that record appear instead of a canonical release;
omitting `--with-about` avoids that change. Normal setup and startup do not
automatically seed About data.
