from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import RegistrationSettings
from ..services import get_account_type


def sponsor_help_contact(company, active):
    """A sponsor's driver support contact, falling back to its public details."""
    return {
        'id': company.id,
        'name': company.name,
        'contact_name': company.support_contact_name,
        'email': company.support_email or company.contact_email,
        'phone': company.support_phone or company.contact_phone,
        'hours': company.support_hours,
        'active': active,
    }


def driver_sponsor_contacts(driver, session):
    from drivers.active_sponsor import display_sponsor_id
    from drivers.models import DriverSponsorMembership

    active_id = display_sponsor_id(driver, session)
    memberships = (
        driver.memberships.filter(status__in=DriverSponsorMembership.ACTIVE_STATUSES)
        .select_related('sponsor')
        .order_by('sponsor__name', 'sponsor_id')
    )
    contacts = [
        sponsor_help_contact(membership.sponsor, membership.sponsor_id == active_id)
        for membership in memberships
    ]
    # The sponsor the driver is working with comes first.
    return sorted(contacts, key=lambda contact: not contact['active'])


@method_decorator(never_cache, name='dispatch')
class HelpContactsView(APIView):
    """Who a signed-in user can contact for help: their sponsors and the site admins.

    Open to any signed-in user, without MFA, so someone stuck setting up MFA
    can still find help.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings_row = RegistrationSettings.load()
        driver = getattr(request.user, 'driver_profile', None)
        sponsors = []
        if get_account_type(request.user) == 'driver' and driver is not None:
            sponsors = driver_sponsor_contacts(driver, request.session)
        return Response(
            {
                'admin': {
                    'email': settings_row.support_email,
                    'phone': settings_row.support_phone,
                },
                'sponsors': sponsors,
            }
        )
