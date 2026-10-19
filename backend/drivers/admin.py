from django.contrib import admin

from .models import Driver, PointTransaction


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'sponsor', 'status')
    list_select_related = ('user', 'sponsor')
    search_fields = ('name', 'user__username')


@admin.register(PointTransaction)
class PointTransactionAdmin(admin.ModelAdmin):
    list_display = (
        'driver',
        'point_change',
        'sponsor',
        'changed_by_user',
        'changed_at',
    )
    list_filter = ('sponsor', 'changed_at')
    list_select_related = ('driver', 'sponsor', 'changed_by_user')
    search_fields = (
        'driver__name',
        'driver__user__username',
        'changed_by_user__username',
        'reason',
    )
    readonly_fields = ('changed_at',)
