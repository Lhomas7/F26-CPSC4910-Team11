from django.db import models

# Create your models here.
class Driver(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
    ]
    name = models.CharField(max_length=100)
    sponsor_id = models.IntegerField()  # placeholder, swap for ForeignKey once Sponsor model is made
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    def __str__(self):
        return self.name


class AboutInformation(models.Model):
    """Release information displayed on the public About page."""

    team_number = models.PositiveIntegerField()
    version = models.CharField(max_length=50)
    release_date = models.DateField()
    product_name = models.CharField(max_length=150)
    product_description = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'about information'
        verbose_name_plural = 'about information'

    def __str__(self):
        return f'{self.product_name} - {self.version}'
