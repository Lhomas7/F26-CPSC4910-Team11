from django.contrib import admin

from .models import Driver, DriverSponsorMembership, PointTransaction, SponsorBehavior


class DriverSponsorMembershipInline(admin.TabularInline):
    """Read-only: membership changes must go through the audited services."""

    model = DriverSponsorMembership
    extra = 0
    fields = readonly_fields = ('sponsor', 'status', 'created_at', 'updated_at')
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ('name', 'user')
    list_select_related = ('user',)
    search_fields = ('name', 'user__username')
    inlines = (DriverSponsorMembershipInline,)


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


@admin.register(SponsorBehavior)
class SponsorBehaviorAdmin(admin.ModelAdmin):
    list_display = ('description', 'kind', 'point_value', 'sponsor')
    list_filter = ('kind', 'sponsor')
    list_select_related = ('sponsor',)
    search_fields = ('description',)
