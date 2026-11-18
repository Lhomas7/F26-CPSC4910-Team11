from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import MFAEnrolled, SponsorOrAdmin
from ..services.bulk_upload import MAX_UPLOAD_BYTES, BulkUploadFileError, run_bulk_upload
from .sponsor_organization import refuse_while_viewing_as


def _truthy(value):
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


@method_decorator(never_cache, name='dispatch')
class BulkUploadView(APIView):
    """Create organizations, drivers, and sponsors from an uploaded text file.

    Sponsors can add drivers and sponsors to their own organization only;
    administrators can also create organizations and use any of them. Send
    `dry_run=true` to check the file and get the same report without creating
    anything. Invalid records are reported by line and skipped; valid ones are
    still created.
    """

    permission_classes = [IsAuthenticated, SponsorOrAdmin, MFAEnrolled]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not request.user.is_active:
            raise PermissionDenied('An active account is required.')
        refuse_while_viewing_as(request, 'uploading a file')
        upload = request.FILES.get('file')
        if upload is None:
            return Response(
                {'file': ['Choose a file to upload.']}, status=status.HTTP_400_BAD_REQUEST
            )
        if upload.size > MAX_UPLOAD_BYTES:
            return Response(
                {'file': [f'The file is too large. Upload at most {MAX_UPLOAD_BYTES // 1024} KB.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            report = run_bulk_upload(
                request.user,
                data=upload.read(MAX_UPLOAD_BYTES + 1),
                filename=upload.name,
                requested_format=request.data.get('format'),
                dry_run=_truthy(request.data.get('dry_run', '')),
            )
        except BulkUploadFileError as error:
            return Response({'file': [str(error)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(report)
