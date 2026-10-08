from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..serializers import SelfProfileSerializer


class SelfProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # This endpoint is intentionally self-scoped and accepts no user ID
        return Response(SelfProfileSerializer(request.user, context={'request': request}).data)

    def patch(self, request):
        # Read-only serializer fields prevent role, company, and ID changes
        serializer = SelfProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
