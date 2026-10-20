# Account security

How the backend protects sign-in, stored data, and administrator access. Everything
here is enforced by Django; the React app only reflects it.

## Personal information

- Every endpoint that returns personal data scopes its queryset on the server from
  `request.user` (drivers see themselves, sponsors see their company's drivers, admins
  use `/api/admin/...`). A record outside that scope is a `404`, not a `403`.
- Driver records returned to sponsors carry no email or phone number.
- Personal-data responses are sent with `Cache-Control: no-store`.
- Linking a driver by username answers the same way for an unknown username and for a
  driver who belongs to another sponsor, so usernames and affiliations cannot be probed.

## Sign-in lockout

`accounts/services/login_throttle.py`. After `LOGIN_MAX_FAILED_ATTEMPTS` (5) failures
inside `LOGIN_LOCKOUT_MINUTES` (15) for one username, `/login/`, `/login/mfa/` and
`/login/mfa/request-code/` answer `429` with a `Retry-After` header, even for the right
password. It applies to admin, sponsor and driver accounts alike, counts wrong MFA codes,
and treats unknown usernames the same as real ones. It is based on `LoginAttempt` rows,
so it works across server processes. Refused attempts are not recorded, so an attacker
cannot keep a lock alive by hammering it.

## Data at rest

- Passwords: PBKDF2-HMAC-SHA256, a random per-password salt, set explicitly in
  `PASSWORD_HASHERS`. MFA codes and backup codes use the same hashers.
- Phone numbers (`Driver.phone_number`, `MFASettings.phone_number`) are encrypted with
  Fernet through `accounts.fields.EncryptedCharField`; TOTP seeds already were.
- Encrypted columns cannot be searched or sorted in SQL.
- Not encrypted in the app: email addresses (used for lookup). Turn on RDS storage
  encryption for the database as the base layer.

## Administrator View-As eligibility

Starting View-As requires an authenticated staff administrator whose required
MFA is enrolled. The target must be an active Driver or Sponsor. When the
target's role or Sponsor Organization requires MFA, the target must complete
enrollment before an administrator can enter View-As. Viewing an account does
not grant permission to enroll or change its security methods on its behalf.

The start endpoint checks eligibility before storing a session or creating a
successful `start` audit event. Rejections retain the existing `detail` message
and include a stable `code`:

- `view_as_invalid_role`: the target is not a Driver or Sponsor.
- `view_as_inactive_target`: the target account is inactive.
- `view_as_target_mfa_required`: the target has required MFA without enrollment.
- `view_as_already_active`: a View-As session is already active.

Active sessions recheck target eligibility on every request. Expiration,
deletion, deactivation, loss of an eligible role, or loss of required MFA ends
View-As. Invalid or timezone-naive start timestamps are treated as expired.

An ended session is reported as inactive impersonation metadata on `/api/me/`,
including a `code` such as `view_as_expired` or `view_as_target_deleted`.
Other API requests return `409` until the client acknowledges the return using
the existing stop endpoint. This prevents a request intended for the viewed
user from silently executing as the administrator. Stop also succeeds when it
races automatic expiration. The shared API client handles this response by
restoring the administrator identity and showing the existing session-ended
notice. Detection occurs on the next API request; idle polling is not added.

## Administrator password reset

Admins are excluded from the public "Forgot password" email flow. Instead:

1. Another admin (signed in, MFA enrolled) opens the target's account page, enters their
   own password and chooses **Send reset link**
   (`POST /api/admin/admins/<id>/password-reset/`). They cannot reset themselves, never
   see the link, and cannot do it while viewing as another user.
2. The target gets an email with a link that lasts 15 minutes
   (`ADMIN_PASSWORD_RESET_TIMEOUT_SECONDS`), is single-use, and does not work at the
   ordinary reset endpoint (nor the other way round).
3. On `/admin-reset-password/<uid>/<token>` the target must also give an authenticator
   or backup code before choosing a new password. Wrong codes count toward the lockout.
4. Completing it ends all sessions, forgets trusted devices, emails the target, and
   writes an `AdminPasswordResetEvent` (visible read-only in Django admin).

An admin with no authenticator or backup codes is reset on the server:
`python manage.py changepassword <username>`.
