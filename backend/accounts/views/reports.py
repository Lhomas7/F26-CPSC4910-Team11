import csv

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import SponsorCompany
from ..permissions import MFAEnrolled
from ..services.reports import (
    AUDIT_CATEGORIES,
    MAX_INVOICE_DAYS,
    audit_events,
    build_invoice,
    parse_date_range,
)

AUDIT_PAGE_LIMIT = 100
AUDIT_MAX_LIMIT = 500
AUDIT_EXPORT_LIMIT = 10_000
CSV_COLUMNS = ('timestamp', 'category', 'action', 'actor', 'target', 'detail')


def _spreadsheet_safe(value):
    """Stop a cell that starts like a formula from being run when opened in Excel."""
    text = str(value)
    return f"'{text}" if text[:1] in ('=', '+', '-', '@', '\t', '\r') else text


def _serialize(event):
    return {**event, 'timestamp': event['timestamp'].isoformat()}


@method_decorator(never_cache, name='dispatch')
class AdminAuditLogView(APIView):
    """Audit events for a date range, as JSON or (``?export=csv``) a CSV download.

    Query parameters, all optional: ``start`` and ``end`` (YYYY-MM-DD, both days
    included), ``category`` (one of AUDIT_CATEGORIES) and ``limit``.
    """

    permission_classes = [IsAdminUser, MFAEnrolled]

    def get(self, request):
        date_range = parse_date_range(request.query_params)

        category = (request.query_params.get('category') or '').strip()
        if category and category not in AUDIT_CATEGORIES:
            raise serializers.ValidationError({'category': ['Choose a listed category.']})

        exporting = request.query_params.get('export') == 'csv'
        try:
            limit = int(request.query_params.get('limit', AUDIT_PAGE_LIMIT))
        except ValueError:
            limit = AUDIT_PAGE_LIMIT
        limit = AUDIT_EXPORT_LIMIT if exporting else min(max(limit, 1), AUDIT_MAX_LIMIT)

        events, truncated = audit_events(date_range, category=category or None, limit=limit)

        if exporting:
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="audit-log.csv"'
            writer = csv.writer(response)
            writer.writerow(CSV_COLUMNS)
            for event in events:
                row = _serialize(event)
                writer.writerow([_spreadsheet_safe(row[column]) for column in CSV_COLUMNS])
            return response

        return Response(
            {
                'results': [_serialize(event) for event in events],
                'truncated': truncated,
                'limit': limit,
                'range': {
                    'start': date_range.start.isoformat() if date_range.start else None,
                    'end': date_range.end.isoformat() if date_range.end else None,
                },
            }
        )


@method_decorator(never_cache, name='dispatch')
class AdminInvoiceView(APIView):
    """An invoice for one sponsor covering a billing period the admin chooses.

    Query parameters, all required: ``sponsor`` (organization id), ``start``
    and ``end`` (YYYY-MM-DD, both days included).
    """

    permission_classes = [IsAdminUser, MFAEnrolled]

    def get(self, request):
        sponsor = (request.query_params.get('sponsor') or '').strip()
        if not sponsor.isdigit():
            raise serializers.ValidationError({'sponsor': ['Choose a sponsor organization.']})
        date_range = parse_date_range(request.query_params, required=True, max_days=MAX_INVOICE_DAYS)
        company = get_object_or_404(SponsorCompany, pk=int(sponsor))
        return Response(build_invoice(company, date_range))
