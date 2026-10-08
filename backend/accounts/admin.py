from django.contrib import admin

from .models import (
    AdminImpersonationEvent,
    LoginAttempt,
    RegistrationEmailCode,
    RegistrationSettings,
    SponsorAccount,
    SponsorCompany,
    TrustedDevice,
)


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


@admin.register(AdminImpersonationEvent)
class AdminImpersonationEventAdmin(admin.ModelAdmin):
    list_display = ('admin', 'action', 'target', 'target_role', 'ip_address', 'created_at')
    list_filter = ('action', 'target_role')
    search_fields = ('admin__username', 'target__username')
    date_hierarchy = 'created_at'

    # These security audit rows are written only by the application.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(RegistrationSettings)
class RegistrationSettingsAdmin(admin.ModelAdmin):
    list_display = ('email_verification_required', 'updated_at')

    # A single settings row; RegistrationSettings.load() creates it on demand.
    def has_add_permission(self, request):
        return not RegistrationSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(RegistrationEmailCode)
class RegistrationEmailCodeAdmin(admin.ModelAdmin):
    list_display = ('email', 'used', 'attempts', 'created_at', 'expires_at')
    list_filter = ('used',)
    search_fields = ('email',)

    # Code rows are written only by the signup flow and store only hashes.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(TrustedDevice)
class TrustedDeviceAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at', 'last_used_at')
    search_fields = ('user__username',)
    exclude = ('token_hash',)

    # Rows are created only when a user answers "Yes, this is my device".
    # Deleting one is allowed so an admin can make that browser ask again.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
