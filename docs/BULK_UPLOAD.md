# Bulk Upload

Sponsors and administrators can add many people at once from **Bulk upload** in the sidebar
(`POST /api/bulk-upload/`, multipart field `file`).

## Pipe-delimited format (`.txt`)

One record per line, columns separated by `|`:

```text
Type|Organization|FirstName|LastName|Email|Points|Reason
O|Acme Trucking
S|Acme Trucking|Pat|Boss|pat.boss@example.com
D|Acme Trucking|Jane|Doe|jane.doe@example.com|500|Welcome bonus
```

- The header row is optional. Blank lines and lines starting with `#` are ignored.
- A value cannot contain `|`. Trailing empty columns may be left off.
- `O` creates an organization (administrators only; only the Organization column is used).
  An organization that already exists is reported as unchanged.
- `D` adds a driver and `S` adds a sponsor. Both need FirstName, LastName and Email.
- `Points` is an optional non-zero whole number (negative removes points). `Reason` is optional
  text and defaults to "Bulk upload". Sponsor lines cannot have points.

### Who can use which organization

| Uploader      | `O` lines | Organization column on `D`/`S` lines                                     |
| ------------- | --------- | ------------------------------------------------------------------------ |
| Sponsor       | Rejected  | Empty, or their own organization. Any other name is rejected.            |
| Administrator | Allowed   | Required. Must already exist or be created by an earlier `O` line above. |

### Drivers

- Drivers added by an upload are **accepted immediately**; no approval step is needed.
- If the email already belongs to a driver, no account is created: an unassigned driver joins the
  organization (and is notified), a pending driver of the same organization is accepted, and an
  approved driver just receives any points. A driver of another organization, or any non-driver
  account, is rejected.
- New people get a username made from their email and an email with a link to choose their own
  password. No password is ever stored in or sent from the file.

## CSV format (`.csv`)

First line is a header with at least `First Name`, `Last Name`, `Email`; `Organization`, `Points`
and `Reason` are optional. Every row is a driver and follows the same rules as `D` lines.

## Validation and errors

- Every line is validated against the rules above. A bad line is reported with its line number,
  field, message and original text, and is skipped; all other lines are still saved. A line that
  fails part way is undone completely.
- Send `dry_run=true` ("Check file" in the UI) to get the same report without saving anything.
- File-level problems (empty, not UTF-8 text, over 1 MB or 500 lines, CSV missing a required
  column) reject the whole file with a `400`.
- Uploads are refused while an administrator is viewing as a sponsor.
