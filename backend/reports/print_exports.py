from io import BytesIO
from xml.sax.saxutils import escape

from django.http import FileResponse, HttpResponse
from django.template.loader import render_to_string
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from .services import GROUP_DRIVER


def _print_context(report):
    def display_row(row):
        count, gross, share = row[-3:]
        return (*row[:-3], f'{count:,}', f'{gross:,.2f}', f'{share:,.4f}')

    scope = report.scope
    first_row = report.rows[0] if report.rows else None
    sponsor = 'All sponsors'
    if scope.sponsor_id:
        sponsor = first_row[0] if first_row else f'ID {scope.sponsor_id}'
    filters = [('Sponsor', sponsor)]
    if scope.group_by == GROUP_DRIVER:
        driver = 'All drivers'
        if scope.driver_id:
            driver = first_row[1] if first_row else f'ID {scope.driver_id}'
        filters.append(('Driver', driver))

    return {
        'title': report.title,
        'generated': report.generated_at.strftime('%Y-%m-%d %H:%M:%S UTC'),
        'filters': filters,
        'headings': report.headings,
        'label_count': len(report.headings) - 3,
        'rows': [display_row(row) for row in report.rows],
        'total': display_row(report.total),
    }


def sales_html_response(report):
    html = render_to_string('reports/sales_export.html', _print_context(report))
    return HttpResponse(
        html,
        content_type='text/html; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{report.filename("html")}"'},
    )


def sales_pdf_response(report):
    context = _print_context(report)
    output = BytesIO()
    by_driver = report.scope.group_by == GROUP_DRIVER
    document = SimpleDocTemplate(
        output,
        pagesize=landscape(letter) if by_driver else letter,
        title=report.title,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=42,
    )
    body = ParagraphStyle('Report body', fontName='Helvetica', fontSize=9, leading=12)
    number = ParagraphStyle('Report number', parent=body, alignment=TA_RIGHT)
    heading = ParagraphStyle('Report heading', parent=body, fontName='Helvetica-Bold')
    title = ParagraphStyle('Report title', parent=heading, fontSize=22, leading=27, spaceAfter=10)
    content = [Paragraph(escape(report.title), title)]
    for label, value in [*context['filters'], ('Generated', context['generated'])]:
        content.append(Paragraph(f'<b>{escape(label)}:</b> {escape(value)}', body))
    content.append(Spacer(1, 14))
    if not context['rows']:
        content.extend([Paragraph('No completed sales match this report.', body), Spacer(1, 8)])

    table_rows = [[Paragraph(escape(label), heading) for label in context['headings']]]
    for values in [*context['rows'], context['total']]:
        table_rows.append(
            [
                Paragraph(escape(value), body if column < context['label_count'] else number)
                for column, value in enumerate(values)
            ]
        )
    widths = (0.21, 0.18, 0.16, 0.13, 0.16, 0.16) if by_driver else (0.44, 0.16, 0.20, 0.20)
    table = LongTable(
        table_rows,
        colWidths=[document.width * fraction for fraction in widths],
        repeatRows=1,
        splitInRow=1,
        hAlign='LEFT',
    )
    table.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e1efe8')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#f5f7f6')]),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e1efe8')),
                ('LINEABOVE', (0, -1), (-1, -1), 0.75, colors.HexColor('#709080')),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]
        )
    )
    content.append(table)

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor('#45564d'))
        canvas.setFont('Helvetica', 9)
        canvas.drawString(doc.leftMargin, 23, report.title)
        canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 23, f'Page {doc.page}')
        canvas.restoreState()

    document.build(content, onFirstPage=footer, onLaterPages=footer)
    output.seek(0)
    return FileResponse(
        output, as_attachment=True, filename=report.filename('pdf'), content_type='application/pdf'
    )
