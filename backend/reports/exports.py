import csv
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO

from django.http import FileResponse, HttpResponse
from xlsxwriter import Workbook

from .services import GROUP_DRIVER, SalesReportScope, sales_report_queryset

CSV_TYPE = 'text/csv; charset=utf-8'
XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


@dataclass(frozen=True)
class SalesExport:
    scope: SalesReportScope
    generated_at: datetime
    headings: tuple[str, ...]
    rows: list[tuple]
    total: tuple

    @property
    def title(self):
        return f'Sales by {self.scope.group_by.title()}'

    def filename(self, extension):
        name = f'sales-by-{self.scope.group_by}'
        if self.scope.sponsor_id:
            name += f'-sponsor-{self.scope.sponsor_id}'
        if self.scope.driver_id:
            name += f'-driver-{self.scope.driver_id}'
        return f'{name}-{self.generated_at:%Y-%m-%d}.{extension}'


def build_sales_export(scope):
    by_driver = scope.group_by == GROUP_DRIVER
    labels = ('Sponsor', 'Driver', 'Username') if by_driver else ('Sponsor',)
    headings = (*labels, 'Completed sales', 'Gross sales (USD)', 'Project share (USD)')
    rows = []
    count, gross, share = 0, Decimal('0.00'), Decimal('0.0000')
    for row in sales_report_queryset(scope).iterator():
        names = (row['sponsor__name'],)
        if by_driver:
            names += (row['driver__name'], row['driver__user__username'])
        row_count = row['sale_count']
        row_gross = row['gross_sales_usd'].quantize(Decimal('0.01'))
        row_share = row['project_share_usd'].quantize(Decimal('0.0001'))
        rows.append((*names, row_count, row_gross, row_share))
        # Sum the actual exported rows so concurrent sales cannot split totals from detail.
        count += row_count
        gross += row_gross
        share += row_share
    total = ('Total', *('' for _ in labels[1:]), count, gross, share)
    return SalesExport(scope, datetime.now(UTC), headings, rows, total)


def _safe_csv_cell(value):
    if isinstance(value, str) and (
        value.startswith(('\t', '\r', '\n'))
        or value.lstrip().startswith(('=', '+', '-', '@', '＝', '＋', '－', '＠'))
    ):
        return "'" + value
    return value


def sales_csv_response(report, *, excel_compatible=True):
    response = HttpResponse(content_type=CSV_TYPE)
    filename = report.filename('csv')
    if excel_compatible:
        response.write('\ufeff')  # Excel recognizes UTF-8 when opening the CSV directly.
    else:
        filename = f'{filename.removesuffix(".csv")}-utf8.csv'
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    scope = report.scope
    metadata = (
        report.title,
        f'ID {scope.sponsor_id}' if scope.sponsor_id else 'All sponsors',
        f'ID {scope.driver_id}' if scope.driver_id else 'All drivers',
        report.generated_at.isoformat(timespec='seconds'),
    )
    writer = csv.writer(response)
    writer.writerow(
        (*report.headings, 'Report name', 'Sponsor filter', 'Driver filter', 'Generated (UTC)')
    )
    for row in report.rows:
        writer.writerow(_safe_csv_cell(value) for value in (*row, *metadata))
    writer.writerow((*report.total, *metadata))
    return response


def sales_utf8_csv_response(report):
    return sales_csv_response(report, excel_compatible=False)


def sales_xlsx_response(report):
    output = BytesIO()
    with Workbook(output, {'in_memory': True}) as workbook:
        sheet = workbook.add_worksheet('Sales report')
        header = workbook.add_format({'bold': True, 'bg_color': '#E1EFE8'})
        bold = workbook.add_format({'bold': True})
        formats = [
            workbook.add_format({'num_format': code})
            for code in ('#,##0', '"$"#,##0.00', '"$"#,##0.0000')
        ]
        total_formats = [
            workbook.add_format({'bold': True, 'num_format': code})
            for code in ('#,##0', '"$"#,##0.00', '"$"#,##0.0000')
        ]
        date = workbook.add_format({'num_format': 'yyyy-mm-dd hh:mm:ss'})
        numeric_start = len(report.headings) - 3
        sheet.set_column(0, numeric_start - 1, 28)
        sheet.set_column(numeric_start, len(report.headings) - 1, 23)
        sheet.write_string(0, 0, report.title, bold)
        sheet.write_string(1, 0, 'Generated (UTC)')
        sheet.write_datetime(1, 1, report.generated_at.replace(tzinfo=None), date)
        sheet.write_string(2, 0, 'Sponsor')
        sheet.write_string(
            2, 1, f'ID {report.scope.sponsor_id}' if report.scope.sponsor_id else 'All sponsors'
        )
        if report.scope.group_by == GROUP_DRIVER:
            sheet.write_string(3, 0, 'Driver')
            sheet.write_string(
                3, 1, f'ID {report.scope.driver_id}' if report.scope.driver_id else 'All drivers'
            )
        header_row = 5
        sheet.write_row(header_row, 0, report.headings, header)
        sheet.freeze_panes(header_row + 1, 0)
        for index, row in enumerate([*report.rows, report.total], start=header_row + 1):
            is_total = index == header_row + len(report.rows) + 1
            for column, value in enumerate(row[:numeric_start]):
                # Explicit text cells keep names and usernames inert, including formula-like strings.
                sheet.write_string(index, column, value, bold if is_total else None)
            for column, value in enumerate(row[numeric_start:]):
                style = (total_formats if is_total else formats)[column]
                sheet.write_number(index, numeric_start + column, value, style)
    output.seek(0)
    return FileResponse(
        output, as_attachment=True, filename=report.filename('xlsx'), content_type=XLSX_TYPE
    )
