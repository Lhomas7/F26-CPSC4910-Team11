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
