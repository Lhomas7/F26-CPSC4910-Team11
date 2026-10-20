"""Eligibility rules for administrator View-As sessions."""

from . import get_account_type, get_mfa_status


def view_as_eligibility(user):
    """Return a safe, public reason when a target cannot use View-As."""
    if get_account_type(user) not in ('driver', 'sponsor'):
        return {
            'code': 'view_as_invalid_role',
            'detail': 'Administrators can only view as a driver or sponsor.',
        }
    if not user.is_active:
        return {
            'code': 'view_as_inactive_target',
            'detail': 'An inactive account cannot be viewed as.',
        }
    mfa = get_mfa_status(user)
    if mfa['required'] and not mfa['enrolled']:
        return {
            'code': 'view_as_target_mfa_required',
            'detail': 'This account must finish setting up multi-factor authentication before it can be viewed as.',
        }
    return None
