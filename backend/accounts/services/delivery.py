import logging

from django.conf import settings
from django.core.mail import send_mail

from .sms import send_sms

logger = logging.getLogger(__name__)


def send_code_to_address(address, raw_code):
    """Email a verification code to an address."""
    send_mail(
        subject='Your Good Driver verification code',
        message=f'Your Good Driver verification code is: {raw_code}',
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[address],
        fail_silently=False,
    )


def send_email_code(user, raw_code):
    """Deliver a verification code to a user's account email."""
    send_code_to_address(user.email, raw_code)


def send_sms_code(phone_number, raw_code):
    """Deliver a verification code by SMS."""
    message = f'Your Good Driver verification code is: {raw_code}'
    send_sms(phone_number, message)