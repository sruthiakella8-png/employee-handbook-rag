import requests
from django.conf import settings
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework.decorators import permission_classes

from .models import Document

# Keep in step with MAX_BYTES / EXTENSIONS in rag-service/extract.py
ALLOWED_EXTENSIONS = (".pdf", ".docx", ".md", ".markdown", ".txt")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


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

    # Cheap checks here, so a wrong or huge file is rejected before it is forwarded.
    name = (file.name or "").lower()
    if name.endswith(".doc"):
        return Response(
            {"error": "Old .doc files aren't supported. Save it as .docx or PDF and upload again."},
            status=400,
        )
    if not name.endswith(ALLOWED_EXTENSIONS):
        return Response(
            {"error": "Unsupported file type. Upload a PDF, Word (.docx), Markdown or text file."},
            status=400,
        )
    if file.size == 0:
        return Response({"error": "The file is empty."}, status=400)
    if file.size > MAX_UPLOAD_BYTES:
        return Response(
            {"error": f"The file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."},
            status=413,
        )

    try:
        r = requests.post(
            f"{settings.RAG_SERVICE_URL}/ingest",
            files={"file": (file.name, file.read(), file.content_type)},
            timeout=180,  # reading a long PDF and embedding it can take a while
            headers={"Authorization": request.headers.get("Authorization", "")},
        )
    except requests.RequestException:
        return Response({"error": "The RAG service is unreachable."}, status=502)

    try:
        data = r.json()
    except ValueError:
        # The RAG service crashed and sent something that isn't JSON.
        return Response({"error": "The RAG service returned an unexpected response."}, status=502)

    # FastAPI reports errors as {"detail": "..."}; the admin screen reads "detail" or "error".
    return Response(data, status=r.status_code)
