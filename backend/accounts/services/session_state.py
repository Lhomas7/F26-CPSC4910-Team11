from .device_trust import DEVICE_CHECK_KEY


def session_info(request):
    """Session details the frontend needs alongside the signed-in user."""
    return {
        'device_check': request.session.get(DEVICE_CHECK_KEY),
        'idle_timeout_seconds': None,
    }
