from decimal import Decimal

from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import AdminAccount, MFAEnrolled

from .services import (
    parse_sales_report_scope,
    report_options,
    sales_report_queryset,
    sales_report_summary,
)


def _money(value, places):
    quantum = Decimal('1').scaleb(-places)
    return format(Decimal(value).quantize(quantum), f'.{places}f')


class ReportPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100


class AdminReportView(APIView):
    permission_classes = [IsAuthenticated, AdminAccount, MFAEnrolled]


@method_decorator(never_cache, name='dispatch')
class SalesReportOptionsView(AdminReportView):
    def get(self, request):
        unknown = request.query_params.keys() - {'sponsor_id'}
        if unknown:
            raise ValidationError({key: 'This query parameter is not supported.' for key in sorted(unknown)})
        raw_sponsor_id = request.query_params.get('sponsor_id')
        sponsor_id = None
        if raw_sponsor_id not in (None, ''):
            try:
                sponsor_id = int(raw_sponsor_id)
            except (TypeError, ValueError):
                raise ValidationError({'sponsor_id': 'Enter a positive integer.'}) from None
            if sponsor_id < 1:
                raise ValidationError({'sponsor_id': 'Enter a positive integer.'})
        sponsors, drivers = report_options(sponsor_id)
        return Response({
            'sponsors': list(sponsors),
            'drivers': [
                {
                    'id': driver.pk,
                    'name': driver.name,
                    'username': driver.user.get_username(),
                }
                for driver in drivers
            ],
        })


@method_decorator(never_cache, name='dispatch')
class SalesReportView(AdminReportView):
    def get(self, request):
        unknown = request.query_params.keys() - {
            'group_by', 'sponsor_id', 'driver_id', 'page', 'page_size',
        }
        if unknown:
            raise ValidationError({key: 'This query parameter is not supported.' for key in sorted(unknown)})
        scope = parse_sales_report_scope(request.query_params)
        summary = sales_report_summary(scope)
        rows = sales_report_queryset(scope)
        paginator = ReportPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        results = []
        for row in page:
            result = {
                'sale_count': row['sale_count'],
                'gross_sales_usd': _money(row['gross_sales_usd'], 2),
                'project_share_usd': _money(row['project_share_usd'], 4),
            }
            if scope.group_by == 'sponsor':
                result['sponsor'] = {
                    'id': row['sponsor_id'],
                    'name': row['sponsor__name'],
                }
            else:
                result.update({
                    'driver': {
                        'id': row['driver_id'],
                        'name': row['driver__name'],
                        'username': row['driver__user__username'],
                    },
                    'sponsor': {
                        'id': row['sponsor_id'],
                        'name': row['sponsor__name'],
                    },
                })
            results.append(result)

        response = paginator.get_paginated_response(results)
        response.data.update({
            'scope': {
                'group_by': scope.group_by,
                'sponsor_id': scope.sponsor_id,
                'driver_id': scope.driver_id,
            },
            'summary': {
                'sale_count': summary['sale_count'],
                'gross_sales_usd': _money(summary['gross_sales_usd'], 2),
                'project_share_usd': _money(summary['project_share_usd'], 4),
                'project_share_rate_percent': '1.00',
            },
        })
        return response

