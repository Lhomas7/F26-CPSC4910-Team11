import logging
import os

logger = logging.getLogger(__name__)


def send_sms(phone_number: str, message: str) -> None:
    """Send an SMS via Twilio, falling back to a console log for dev/CI.

    Only uses Twilio when all three credentials are configured; otherwise the
    message is logged so tests and local development never need a real account.
    """
    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    from_number = os.environ.get('TWILIO_FROM_NUMBER')
    if sid and token and from_number:
        from twilio.rest import Client
        Client(sid, token).messages.create(body=message, from_=from_number, to=phone_number)
    else:
        logger.info('SMS (console fallback) to %s: %s', phone_number, message)