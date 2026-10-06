# Account Input Validation and Normalization

This document is the acceptance specification for account creation and account-profile input. The Django API is authoritative; React repeats relevant rules only to provide immediate feedback.

## Processing order

1. Accept the submitted value without logging sensitive content.
2. Normalize Unicode text to NFKC.
3. Trim surrounding whitespace. Collapse internal whitespace only for human-readable names and organization names.
4. Reject invisible control and formatting characters. Ordinary whitespace is allowed before normalization.
5. Validate format, length, uniqueness, and cross-field rules.
6. Store the canonical value through Django's ORM. Never construct SQL from user input.

Passwords are an exception: they are never trimmed or Unicode-normalized because that would silently change the credential.

## Implemented acceptance rules

| Field | Canonical form | Accepted format and limits | Additional checks |
| --- | --- | --- | --- |
| Email | NFKC, trimmed, lowercase | Starts with an alphanumeric local-part character; multi-label domain; alphabetic TLD of at least two characters; maximum 254 characters | Case-insensitive uniqueness |
| First and last name | NFKC, trimmed, repeated whitespace collapsed | 1–50 common Latin or Latin-accented letters; single spaces, apostrophes, periods, or hyphens between parts | No digits or leading, trailing, or repeated separators |
| Username | NFKC and trimmed; original case retained | 3–30 ASCII letters, digits, periods, underscores, or hyphens | Case-insensitive uniqueness; blocks `admin`, `root`, `support`, `null`, and `undefined` |
| Organization name | NFKC, trimmed, repeated whitespace collapsed | 1–200 characters | Invisible control/formatting characters rejected |
| Password | Stored only as a Django password hash; submitted value is not transformed | At least 12 characters, 3 lowercase letters, 2 uppercase letters, 2 digits, and one of `!@#$%^&*()-_+.` | Must not contain the full username or email address; Django's configured password validators also run for account creation |
| Password confirmation | Not stored | Must exactly match the password | Checked by both React and Django |
| Account-creation consent | Boolean; not currently stored as an audit record | Must be `true` for public registration | Checked by both React and Django |
| Email verification code | Trimmed; not stored (only a hash of the issued code is kept) | Optional; 6 digits, required only when an administrator has turned on email verification | Must match an unexpired, unused code issued to the submitted email address |

### Email verification

Administrators can require new driver and sponsor accounts to prove control of their email address (Users page → **Account creation**, stored in `accounts_registrationsettings`). It is off by default. When it is on, public registration takes two submissions to the same endpoint:

1. The client submits the account details without `code`. Django runs every rule above, emails a 6-digit code to the canonical email address, and returns `202` with `verification_required: true`. No account is created and the password is not stored.
2. The client submits the same details again with `code`. Django re-runs every rule (so a username or email taken in the meantime is still rejected), checks the code, and only then creates the account.

Codes expire after 10 minutes, work once, and are invalidated after 5 wrong attempts. Issuing a new code invalidates the previous one, and a new code can be requested for an address at most once every 30 seconds (`429` otherwise). Email is sent through Django's configured `EMAIL_BACKEND`; the default console backend writes the code to the server log.

### Username compatibility decision

The initial draft proposed `^[A-Za-z][A-Za-z0-9_-]{2,29}$`. The application already uses usernames such as `driver.one`, `jamie.rivera`, and `team11.admin`, so periods remain supported and existing usernames are not invalidated. Whether usernames must begin with a letter remains a future product decision.

### International name support

The ASCII-only name pattern was rejected because it would exclude common names such as José, Renée, and Müller. The implemented pattern supports the Latin-1 and Latin Extended-A ranges. Broader international-script support should use a Unicode-aware validation library rather than continually expanding a handwritten range.

## Security boundaries

- Validation is not SQL escaping. Django ORM parameterization provides SQL-injection protection.
- Input is not HTML-escaped before storage. React escapes rendered text by default; other renderers must escape for their own output context.
- Raw passwords must never appear in logs, error messages, notifications, or API responses.
- Confirmation and consent values are write-only and are not persisted on the user record.
- Admin-created accounts do not require end-user consent because an authenticated administrator creates them; the temporary password still requires server-side confirmation.

## Deferred acceptance work

- Add request throttling for repeated failed public-registration attempts.
- Publish and link the actual Terms of Service and privacy notice.
- Decide whether consent needs versioned, timestamped audit storage instead of request-time validation only.
- Decide whether usernames must start with a letter.
- Evaluate an explicit password maximum based on the selected password hasher and denial-of-service limits.
- Add a migration or reviewed SQL script for normalizing existing records. Runtime validation only governs new or updated values.
- Consider a Unicode-aware name library if the supported user population expands beyond Latin-script names.

## Source locations

- Backend normalization and patterns: `backend/accounts/input_cleaning.py`
- Backend API serializers: `backend/accounts/serializers/`
- Frontend validation helpers: `frontend/src/utils/accountValidation.js`
- Public registration and login forms: `frontend/src/features/authentication/LoginPage.jsx`
- Administrator account form: `frontend/src/features/admin-users/AddUserPage.jsx`
- Password-change panel: `frontend/src/features/accounts/PasswordPanel.jsx`

## Out of scope

Date of birth, postal code, and mailing address are not collected by the current application and have no acceptance rules here.

---

_Last reviewed against the feature-based frontend and backend structure: 2026-10-01._
