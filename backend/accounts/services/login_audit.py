import logging

from accounts.models import LoginAttempt

logger = logging.getLogger(__name__)

USERNAME_MAX_LENGTH = LoginAttempt._meta.get_field('username').max_length


def record_login_attempt(username, successful, user=None):
    """Persist one sign-in outcome for auditing.

    Only the submitted username, the matching account (if any), and the outcome
    are stored; passwords, MFA codes, and session identifiers are never passed
    in. An audit-write failure must not lock people out of the application, so
    it is logged and swallowed.
    """
    try:
        LoginAttempt.objects.create(
            user=user,
            username=(username or '')[:USERNAME_MAX_LENGTH],
            successful=successful,
        )
    except Exception:  # pragma: no cover - defensive; DB outage etc.
        logger.exception('Could not record login attempt.')
