from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError

from accounts.models import SponsorCompany
from drivers.models import Driver

from .models import CompletedSale


GROUP_SPONSOR = 'sponsor'
GROUP_DRIVER = 'driver'
GROUP_CHOICES = (GROUP_SPONSOR, GROUP_DRIVER)


@dataclass(frozen=True)
class SalesReportScope:
    group_by: str
    sponsor_id: int | None
    driver_id: int | None


def _positive_id(params, name):
    raw = params.get(name)
    if raw in (None, ''):
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({name: 'Enter a positive integer.'}) from None
    if value < 1:
        raise ValidationError({name: 'Enter a positive integer.'})
    return value


def parse_sales_report_scope(params):
    group_by = params.get('group_by')
    if group_by not in GROUP_CHOICES:
        raise ValidationError({'group_by': 'Choose sponsor or driver.'})
    sponsor_id = _positive_id(params, 'sponsor_id')
    driver_id = _positive_id(params, 'driver_id')

    if sponsor_id and not SponsorCompany.objects.filter(pk=sponsor_id).exists():
        raise ValidationError({'sponsor_id': 'Choose an existing sponsor organization.'})
    if driver_id and not sponsor_id:
        raise ValidationError({'driver_id': 'Choose a sponsor before choosing one Driver.'})
    if driver_id and group_by != GROUP_DRIVER:
        raise ValidationError({'driver_id': 'Driver scope is only available for sales by Driver.'})
    if driver_id and not Driver.objects.filter(pk=driver_id).filter(
        Q(sponsor_id=sponsor_id) | Q(completed_sales__sponsor_id=sponsor_id),
    ).exists():
        raise ValidationError({'driver_id': 'Choose a Driver from the selected sponsor.'})

    return SalesReportScope(group_by, sponsor_id, driver_id)


def sales_report_queryset(scope):
    sales = CompletedSale.objects.all()
    if scope.sponsor_id:
        sales = sales.filter(sponsor_id=scope.sponsor_id)
    if scope.driver_id:
        sales = sales.filter(driver_id=scope.driver_id)

    if scope.group_by == GROUP_SPONSOR:
        return sales.values(
            'sponsor_id', 'sponsor__name',
        ).annotate(
            sale_count=Count('id'),
            gross_sales_usd=Sum('gross_amount_usd'),
            project_share_usd=Sum('project_share_usd'),
        ).order_by('sponsor__name', 'sponsor_id')

    return sales.values(
        'driver_id',
        'driver__name',
        'driver__user__username',
        'sponsor_id',
        'sponsor__name',
    ).annotate(
        sale_count=Count('id'),
        gross_sales_usd=Sum('gross_amount_usd'),
        project_share_usd=Sum('project_share_usd'),
    ).order_by('sponsor__name', 'driver__name', 'driver_id')


def sales_report_summary(scope):
    sales = CompletedSale.objects.all()
    if scope.sponsor_id:
        sales = sales.filter(sponsor_id=scope.sponsor_id)
    if scope.driver_id:
        sales = sales.filter(driver_id=scope.driver_id)
    return sales.aggregate(
        sale_count=Count('id'),
        gross_sales_usd=Coalesce(Sum('gross_amount_usd'), Decimal('0.00')),
        project_share_usd=Coalesce(Sum('project_share_usd'), Decimal('0.0000')),
    )


def report_options(sponsor_id=None):
    sponsors = SponsorCompany.objects.order_by('name', 'id').values('id', 'name')
    drivers = Driver.objects.none()
    if sponsor_id is not None:
        if not SponsorCompany.objects.filter(pk=sponsor_id).exists():
            raise ValidationError({'sponsor_id': 'Choose an existing sponsor organization.'})
        drivers = Driver.objects.filter(
            Q(sponsor_id=sponsor_id) | Q(completed_sales__sponsor_id=sponsor_id),
        ).distinct().select_related('user').order_by('name', 'id')
    return sponsors, drivers

