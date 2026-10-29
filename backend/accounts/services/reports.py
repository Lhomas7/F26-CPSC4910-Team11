"""Administrator reports: the audit log and sponsor invoices.

Both are read-only views over records the app already keeps, filtered by a
date range the administrator picks.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Case, Count, F, IntegerField, Sum, When
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers

from accounts.models import AdminImpersonationEvent, AdminPasswordResetEvent, LoginAttempt
from drivers.models import DriverStatusChange, PointTransaction

# Dates outside this window are almost certainly typos, and keep the arithmetic safe.
MIN_YEAR, MAX_YEAR = 2000, 2100
# A billing period longer than this is more likely a mistake than an invoice.
MAX_INVOICE_DAYS = 366


@dataclass(frozen=True)
class DateRange:
    """An inclusive range of calendar days and the matching timestamp bounds.

    ``lower`` is the first instant of ``start`` and ``upper`` the first instant
    after ``end``, both in the server time zone, so filtering with
    ``>= lower`` and ``< upper`` includes every moment of both end days.
    Either side is None when it was not given.
    """

    start: date | None
    end: date | None
    lower: datetime | None
    upper: datetime | None


def _parse_day(raw, field):
    try:
        day = date.fromisoformat(raw)
    except (TypeError, ValueError):
        raise serializers.ValidationError({field: ['Enter a valid date (YYYY-MM-DD).']}) from None
    if not MIN_YEAR <= day.year <= MAX_YEAR:
        raise serializers.ValidationError(
            {field: [f'Enter a date between {MIN_YEAR} and {MAX_YEAR}.']}
        )
    return day


def parse_date_range(params, *, required=False, max_days=None):
    """Read ``start`` and ``end`` (YYYY-MM-DD) from query parameters.

    Raises a DRF ValidationError, which becomes a 400 naming the bad field.
    """
    raw = {name: (params.get(name) or '').strip() for name in ('start', 'end')}
    if required:
        missing = {name: ['This field is required.'] for name, value in raw.items() if not value}
        if missing:
            raise serializers.ValidationError(missing)

    start = _parse_day(raw['start'], 'start') if raw['start'] else None
    end = _parse_day(raw['end'], 'end') if raw['end'] else None
    if start and end:
        if end < start:
            raise serializers.ValidationError(
                {'end': ['The end date must be on or after the start date.']}
            )
        if max_days is not None and (end - start).days + 1 > max_days:
            raise serializers.ValidationError(
                {'end': [f'The date range can be at most {max_days} days.']}
            )

    zone = timezone.get_current_timezone()
    return DateRange(
        start=start,
        end=end,
        lower=timezone.make_aware(datetime.combine(start, time.min), zone) if start else None,
        upper=(
            timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), zone)
            if end
            else None
        ),
    )


def _within(queryset, field, date_range):
    if date_range.lower is not None:
        queryset = queryset.filter(**{f'{field}__gte': date_range.lower})
    if date_range.upper is not None:
        queryset = queryset.filter(**{f'{field}__lt': date_range.upper})
    return queryset


# --- audit log -------------------------------------------------------------

AUDIT_CATEGORIES = {
    'sign_in': 'Sign-ins',
    'points': 'Point changes',
    'membership': 'Driver membership',
    'impersonation': 'View-as sessions',
    'admin_password_reset': 'Administrator password resets',
}


def _name(user):
    return user.get_username() if user is not None else ''


def _event(source, pk, timestamp, category, action, actor='', target='', detail=''):
    return {
        # Unique across sources, e.g. "points-12".
        'id': f'{source}-{pk}',
        'timestamp': timestamp,
        'category': category,
        'action': action,
        'actor': actor,
        'target': target,
        'detail': detail,
    }


def _sign_in_events(date_range, limit):
    attempts = _within(
        LoginAttempt.objects.select_related('user'), 'timestamp', date_range
    ).order_by('-timestamp', '-id')[:limit]
    for attempt in attempts:
        # The typed username of a failed attempt is deliberately not shown when it
        # matches no account: people sometimes paste a password into that box.
        yield _event(
            'sign-in',
            attempt.pk,
            attempt.timestamp,
            'sign_in',
            'sign_in_succeeded' if attempt.successful else 'sign_in_failed',
            actor=_name(attempt.user),
            detail='' if attempt.successful or attempt.user else 'Unknown username',
        )


def _point_events(date_range, limit):
    rows = _within(
        PointTransaction.objects.select_related('driver__user', 'changed_by_user'),
        'changed_at',
        date_range,
    ).order_by('-changed_at', '-id')[:limit]
    for row in rows:
        yield _event(
            'points',
            row.pk,
            row.changed_at,
            'points',
            'points_added' if row.point_change > 0 else 'points_removed',
            actor=_name(row.changed_by_user),
            target=_name(row.driver.user),
            detail=f'{row.point_change:+,} points. {row.reason}',
        )


def _membership_events(date_range, limit):
    rows = _within(
        DriverStatusChange.objects.select_related('driver__user', 'changed_by_user'),
        'changed_at',
        date_range,
    ).order_by('-changed_at', '-id')[:limit]
    for row in rows:
        yield _event(
            'membership',
            row.pk,
            row.changed_at,
            'membership',
            f'driver_{row.action}',
            actor=_name(row.changed_by_user),
            target=_name(row.driver.user),
            detail=row.reason,
        )


def _impersonation_events(date_range, limit):
    rows = _within(
        AdminImpersonationEvent.objects.select_related('admin', 'target'),
        'created_at',
        date_range,
    ).order_by('-created_at', '-id')[:limit]
    for row in rows:
        yield _event(
            'impersonation',
            row.pk,
            row.created_at,
            'impersonation',
            f'view_as_{row.action}',
            actor=_name(row.admin),
            target=_name(row.target),
            detail=row.reason or f'Viewing as a {row.target_role}',
        )


def _admin_reset_events(date_range, limit):
    rows = _within(
        AdminPasswordResetEvent.objects.select_related('target', 'requested_by'),
        'created_at',
        date_range,
    ).order_by('-created_at', '-id')[:limit]
    for row in rows:
        yield _event(
            'admin-reset',
            row.pk,
            row.created_at,
            'admin_password_reset',
            f'admin_password_reset_{row.action}',
            actor=_name(row.requested_by),
            target=_name(row.target),
        )


_SOURCES = {
    'sign_in': _sign_in_events,
    'points': _point_events,
    'membership': _membership_events,
    'impersonation': _impersonation_events,
    'admin_password_reset': _admin_reset_events,
}


def audit_events(date_range, *, category=None, limit=100):
    """Audit events inside the range, newest first, from every audited source.

    Returns ``(events, truncated)``; ``truncated`` is True when more events
    matched than ``limit`` allowed, so the report can say it is incomplete.
    """
    selected = [category] if category else list(_SOURCES)
    events = []
    for name in selected:
        # One extra row per source is enough to know whether anything was cut off.
        events.extend(_SOURCES[name](date_range, limit + 1))
    events.sort(key=lambda event: (event['timestamp'], event['id']), reverse=True)
    return events[:limit], len(events) > limit


# --- invoices --------------------------------------------------------------

INVOICE_BASIS = (
    'Points the sponsor awarded to drivers during the billing period, converted to '
    "dollars at the sponsor's points-per-dollar rate. Points removed are shown for "
    'reference and are not credited.'
)


def build_invoice(company, date_range):
    """Itemize the points a sponsor awarded between two dates and price them."""
    awarded = Coalesce(
        Sum(
            Case(
                When(point_change__gt=0, then=F('point_change')),
                default=0,
                output_field=IntegerField(),
            )
        ),
        0,
    )
    removed = Coalesce(
        Sum(
            Case(
                When(point_change__lt=0, then=F('point_change') * -1),
                default=0,
                output_field=IntegerField(),
            )
        ),
        0,
    )
    rows = (
        _within(
            PointTransaction.objects.filter(sponsor=company), 'changed_at', date_range
        )
        .values('driver_id', 'driver__name', 'driver__user__username')
        .annotate(points_awarded=awarded, points_removed=removed, transactions=Count('id'))
        .order_by('driver__name', 'driver_id')
    )

    lines = [
        {
            'driver': row['driver__name'],
            'username': row['driver__user__username'],
            'points_awarded': row['points_awarded'],
            'points_removed': row['points_removed'],
            'transactions': row['transactions'],
        }
        for row in rows
    ]
    total_awarded = sum(line['points_awarded'] for line in lines)
    amount_due = (Decimal(total_awarded) / Decimal(company.points_per_dollar)).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    return {
        'sponsor': {'id': company.pk, 'name': company.name},
        'period': {'start': date_range.start.isoformat(), 'end': date_range.end.isoformat()},
        'issued_on': timezone.localdate().isoformat(),
        'points_per_dollar': company.points_per_dollar,
        'basis': INVOICE_BASIS,
        'lines': lines,
        'totals': {
            'points_awarded': total_awarded,
            'points_removed': sum(line['points_removed'] for line in lines),
            'transactions': sum(line['transactions'] for line in lines),
            'amount_due': str(amount_due),
        },
    }
