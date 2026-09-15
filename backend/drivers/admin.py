from django.contrib import admin

from .models import AboutInformation, Driver


@admin.register(AboutInformation)
class AboutInformationAdmin(admin.ModelAdmin):
    list_display = ('product_name', 'team_number', 'version', 'release_date', 'updated_at')


admin.site.register(Driver)
