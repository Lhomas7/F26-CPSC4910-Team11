from datetime import timedelta

from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import MFAEnrolled, SponsorOrAdmin
from ..serializers import LoginAttemptSerializer

RECENT_ATTEMPT_COUNT = 3
HISTORY_WINDOW = timedelta(hours=24)
# Caps the response if the account was hit by a burst of guesses.
HISTORY_LIMIT = 100


@method_decorator(never_cache, name='dispatch')
class LoginAttemptsView(APIView):
    """The signed-in sponsor's or admin's own recent sign-in attempts."""

    permission_classes = [IsAuthenticated, SponsorOrAdmin, MFAEnrolled]

    def get(self, request):
        # Self-scoped: accepts no user ID, only ever reads request.user's rows.
        attempts = request.user.login_attempts.order_by('-timestamp')
        since = timezone.now() - HISTORY_WINDOW
        return Response({
            'recent': LoginAttemptSerializer(
                attempts[:RECENT_ATTEMPT_COUNT], many=True
            ).data,
            'last_24_hours': LoginAttemptSerializer(
                attempts.filter(timestamp__gte=since)[:HISTORY_LIMIT], many=True
            ).data,
        })
