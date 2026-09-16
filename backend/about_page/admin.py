from django.contrib import admin

from .models import AboutPageRelease


@admin.register(AboutPageRelease)
class AboutPageReleaseAdmin(admin.ModelAdmin):
    date_hierarchy = 'release_date'
    list_display = (
        'product_name',
        'version_number',
        'team_number',
        'release_date',
        'updated_at',
    )
    ordering = ('-release_date', '-updated_at')
    readonly_fields = ('created_at', 'updated_at')
    search_fields = ('product_name', 'version_number')
