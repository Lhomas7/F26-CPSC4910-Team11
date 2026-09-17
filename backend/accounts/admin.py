from django.contrib import admin

from .models import SponsorAccount, SponsorCompany


@admin.register(SponsorCompany)
class SponsorCompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(SponsorAccount)
class SponsorAccountAdmin(admin.ModelAdmin):
    list_display = ('user', 'company', 'created_at')
    list_select_related = ('user', 'company')
    search_fields = ('user__username', 'company__name')