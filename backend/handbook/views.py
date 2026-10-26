import requests
from django.conf import settings
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework.decorators import permission_classes

from .models import Document


@api_view(["GET"])
@permission_classes([IsAdminUser])
def list_documents(request):
    docs = Document.objects.order_by("-uploaded_at")
    return Response(
        [
            {
                "id": d.id,
                "file_name": d.file_name,
                "status": d.status,
                "chunk_count": d.chunk_count,
                "uploaded_at": d.uploaded_at,
            }
            for d in docs
        ]
    )


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser])
def upload_handbook(request):
    file = request.FILES.get("file")
    if file is None:
        return Response({"error": "Send the file as form field 'file'."}, status=400)

    try:
        r = requests.post(
            f"{settings.RAG_SERVICE_URL}/ingest",
            files={"file": (file.name, file.read(), file.content_type)},
            timeout=120,
            headers={"Authorization": request.headers.get("Authorization", "")},
        )
    except requests.RequestException:
        return Response({"error": "The RAG service is unreachable."}, status=502)

    return Response(r.json(), status=r.status_code)