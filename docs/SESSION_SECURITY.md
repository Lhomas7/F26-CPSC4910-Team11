# Session Security

This document describes how signed-in sessions are checked, limited, and ended. The Django API enforces every rule here; React only mirrors them so the screen matches the server.

## Sign-in device check

After a successful sign-in (password step, or MFA step when MFA is enabled), Django decides whether to ask **"Is this your device?"**. It asks when either signal applies:

| Signal                 | Rule                                                                                                                                                                                                  | Setting                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Recent failed attempts | At least 3 failed sign-ins (wrong password or wrong MFA code) for this account in the last 15 minutes, counted only since the account's previous successful sign-in. Asked even on a trusted browser. | `SUSPICIOUS_FAILURE_THRESHOLD`, `SUSPICIOUS_FAILURE_WINDOW_MINUTES` |
| New browser            | The browser does not carry a trust token for this account that is less than 90 days old.                                                                                                              | `TRUSTED_DEVICE_DAYS`                                               |

The question is stored in the session (`device_check`) and returned in the `session` block of the login, MFA, and `GET /api/me/` responses, so a page reload shows it again. React shows a modal that can only be closed by answering or signing out.

The answer goes to `POST /api/device-check/` with `{"trusted": true | false}`. It requires a signed-in session with a question pending, and each question can be answered once.

- **Yes**: the browser is remembered for this account. Django sets an HttpOnly `gd_device` cookie that holds a random token and stores only the token's SHA-256 in `accounts_trusteddevice`. The cookie uses the same `Secure`, `SameSite`, and domain settings as the session cookie and lasts 90 days.
- **No**: the session becomes a shared-device session. It ends when the browser closes, the shorter shared-device idle limit applies (see below), and the browser is not remembered. The account owner gets an email, and drivers also get an in-app notification, so a sign-in that wasn't theirs is noticed.

A password reset deletes every trusted browser for that account. Administrators can also delete individual trusted devices in the Django admin to make a browser ask again.

### Privacy

The check is deliberately minimal. It does not collect IP addresses, user-agent strings, device fingerprints, or location. The only stored data are the token hash with created and last-used times, plus the existing sign-in attempt records (username, account, outcome, and time).

## Session timeouts

`accounts.middleware.SessionTimeoutMiddleware` enforces these limits on every request. The values are in `SESSION_TIMEOUTS` in `backend/config/settings.py`, in seconds.

| Session                               | Idle limit                             | Absolute limit                       |
| ------------------------------------- | -------------------------------------- | ------------------------------------ |
| Administrator                         | 15 minutes                             | 8 hours from sign-in, however active |
| Shared device (answered **No**)       | 15 minutes                             | Ends when the browser closes         |
| Driver or sponsor on a trusted device | None (Django's default 2-week session) | None                                 |

- If more than one row applies, such as an administrator on a shared device, the stricter limit wins.
- The middleware runs before view-as handling, so an administrator viewing as a driver or sponsor keeps the administrator limits.
- Activity is refreshed at most every 30 seconds to avoid writing the session on every request.
- An expired session is deleted and the request gets `401` with `{"code": "session_expired"}`. `POST /api/logout/` still returns `204`, so the client can always clean up.

React reads `idle_timeout_seconds` from the `session` block and runs a matching timer that restarts on each API request. When the timer runs out, or any request returns `session_expired`, React clears the signed-in view, moves to the sign-in page, and shows "You were signed out due to inactivity."

## Signing out

The top-bar **Sign out** button asks for confirmation first. Signing out deletes the session on the server and expires the session cookie. Automatic sign-outs from a timeout skip the confirmation.

## Source locations

- Device trust and failure signals: `backend/accounts/services/device_trust.py`
- Timeout policy and session info: `backend/accounts/services/session_state.py`
- Timeout middleware: `backend/accounts/middleware.py`
- Sign-in and device-check views: `backend/accounts/views/authentication.py`
- Tests: `backend/accounts/tests/test_device_trust.py`, `backend/accounts/tests/test_session_timeout.py`
- Device question dialog: `frontend/src/features/authentication/DeviceCheckDialog.jsx`
- Expiry handling and idle timer: `frontend/src/auth/AuthContext.jsx`, `frontend/src/api/client.js`
- Sign-out confirmation: `frontend/src/app/AppLayout.jsx`, `frontend/src/components/ConfirmDialog.jsx`

---

_Last reviewed against the backend and frontend source: 2026-10-06._
