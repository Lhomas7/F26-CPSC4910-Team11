def get_account_type(user):
    """Return the application role represented by a Django user."""
    # Staff accounts are application administrators, including superusers.
    if user.is_staff or user.is_superuser:
        return 'admin'
    if hasattr(user, 'sponsor_account'):
        return 'sponsor'
    if hasattr(user, 'driver_profile'):
        return 'driver'
    return None


# Per-role MFA policy: which method is offered first during setup, and which
# methods are allowed at all. Admins are restricted to the authenticator app
# so a compromised email/phone can never be used to reach a privileged
# account; sponsors default to it but may opt into the lighter-weight
# methods; drivers default to email, the least technical option.
ROLE_MFA_CONFIG = {
    'admin': {'default_method': 'totp', 'allowed_methods': ('totp',)},
    'sponsor': {'default_method': 'totp', 'allowed_methods': ('totp', 'email', 'sms')},
    'driver': {'default_method': 'email', 'allowed_methods': ('email', 'sms', 'totp')},
}


def get_mfa_default_method(user):
    config = ROLE_MFA_CONFIG.get(get_account_type(user))
    return config['default_method'] if config else None


def get_mfa_allowed_methods(user):
    config = ROLE_MFA_CONFIG.get(get_account_type(user))
    return list(config['allowed_methods']) if config else []


def is_mfa_required(user):
    """Whether this user's role requires MFA to use the app.

    Admins and sponsors always require it. Drivers require it only when their
    sponsor company has opted every driver in.
    """
    account_type = get_account_type(user)
    if account_type in ('admin', 'sponsor'):
        return True
    if account_type == 'driver' and hasattr(user, 'driver_profile') and user.driver_profile.sponsor is not None:
        return user.driver_profile.sponsor.driver_mfa_required
    return False


def get_mfa_status(user):
    """Public MFA state for a user: required flag, enrolled flag, enabled
    methods, this role's default/allowed methods, and remaining backup codes.
    """
    from .mfa import backup_codes_remaining

    mfa = getattr(user, 'mfa_settings', None)
    if mfa is not None:
        enrolled = mfa.any_enabled
        methods = mfa.enabled_methods()
    else:
        enrolled = False
        methods = []
    return {
        'required': is_mfa_required(user),
        'enrolled': enrolled,
        'methods': methods,
        'default_method': get_mfa_default_method(user),
        'allowed_methods': get_mfa_allowed_methods(user),
        'backup_codes_remaining': backup_codes_remaining(user),
    }


def get_public_user(user):
    """Public representation of an authenticated application user."""
    account_type = get_account_type(user)
    if account_type is None:
        return None

    if account_type == 'admin':
        name = user.get_full_name() or user.get_username()
        company = None
    elif account_type == 'sponsor':
        name = user.get_full_name() or user.get_username()
        company = user.sponsor_account.company.name
    else:
        name = user.driver_profile.name
        company = (
            user.driver_profile.sponsor.name
            if user.driver_profile.sponsor is not None
            else None
        )

    return {
        'id': user.id,
        'username': user.get_username(),
        'name': name,
        'account_type': account_type,
        'company': company,
        'mfa': get_mfa_status(user),
    }


def normalize_company_name(name):
    """Collapse surrounding and consecutive whitespace in a company name."""
    return ' '.join(name.split())
