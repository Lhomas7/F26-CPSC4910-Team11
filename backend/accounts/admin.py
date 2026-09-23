from django.contrib import admin
from .models import LoginAttempt, SponsorAccount, SponsorCompany


@admin.register(SponsorCompany)
class SponsorCompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(SponsorAccount)
class SponsorAccountAdmin(admin.ModelAdmin):
    list_display = ('user', 'company', 'created_at')
    list_select_related = ('user', 'company')
    search_fields = ('user__username', 'company__name')


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    list_display = ('username', 'successful', 'timestamp')
    list_filter = ('successful',)
    search_fields = ('username',)
    date_hierarchy = 'timestamp'

    # Audit rows are append-only; nobody should edit or forge them in the admin.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
