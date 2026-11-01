"""
Two small chat endpoints.

  GET   /api/sections/?title=1.2 Sick Leave    the handbook text behind a source chip
  PATCH /api/conversations/<id>/title/         rename one of your own chats
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Chunk, Conversation, Document


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def section_detail(request):
    """
    Look a section up by the title stored with each answer's sources. The active handbook wins; if the
    section only exists in an older upload (the chat is older than the current handbook), return that and
    say so with from_active=false.
    """
    title = request.query_params.get("title", "").strip()
    if not title:
        return Response({"detail": "Send the section title as ?title=..."}, status=status.HTTP_400_BAD_REQUEST)

    matches = Chunk.objects.filter(section_title=title).select_related("document").order_by("id")
    chunk = matches.filter(document__status=Document.Status.ACTIVE).first()
    from_active = chunk is not None
    if chunk is None:
        chunk = matches.order_by("-document__uploaded_at", "id").first()
    if chunk is None:
        return Response({"detail": "This section is no longer available."}, status=status.HTTP_404_NOT_FOUND)

    return Response(
        {
            "section_title": chunk.section_title,
            "text": chunk.text,
            "from_active": from_active,
            "document": chunk.document.file_name,
        }
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def rename_conversation(request, pk: int):
    conversation = get_object_or_404(Conversation, pk=pk, user=request.user)
    title = " ".join(str(request.data.get("title", "")).split())[:120]
    if not title:
        return Response({"detail": "Give the chat a name."}, status=status.HTTP_400_BAD_REQUEST)
    # update_fields keeps updated_at as it was, so renaming doesn't jump the chat to the top of the list.
    conversation.title = title
    conversation.save(update_fields=["title"])
    return Response({"id": conversation.id, "title": conversation.title, "updated_at": conversation.updated_at})
