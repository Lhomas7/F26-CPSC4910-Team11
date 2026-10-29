from django.contrib import admin

from .models import CompletedSale


@admin.register(CompletedSale)
class CompletedSaleAdmin(admin.ModelAdmin):
    list_display = (
        'reference',
        'sponsor',
        'driver',
        'gross_amount_usd',
        'project_share_usd',
        'completed_at',
    )
    list_filter = ('sponsor',)
    search_fields = ('reference', 'driver__name', 'sponsor__name')
    ordering = ('-completed_at', '-id')

    def has_change_permission(self, request, obj=None):
        return obj is None

    def has_delete_permission(self, request, obj=None):
        return False

