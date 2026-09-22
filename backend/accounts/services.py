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
    }


def normalize_company_name(name):
    """Collapse surrounding and consecutive whitespace in a company name."""
    return ' '.join(name.split())
