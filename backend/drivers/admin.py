from django.contrib import admin

from .models import Driver


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'sponsor', 'status')
    list_select_related = ('user', 'sponsor')
    search_fields = ('name', 'user__username')