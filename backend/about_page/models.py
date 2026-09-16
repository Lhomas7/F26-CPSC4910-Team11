from django.db import models


class AboutPageRelease(models.Model):
    """Product and release information presented on the public About page."""

    team_number = models.PositiveSmallIntegerField()
    version_number = models.CharField(max_length=30, unique=True)
    release_date = models.DateField()
    product_name = models.CharField(max_length=100)
    product_description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-release_date', '-updated_at')
        verbose_name = 'About page release'
        verbose_name_plural = 'About page releases'

    def __str__(self):
        return f'{self.product_name} - {self.version_number}'
