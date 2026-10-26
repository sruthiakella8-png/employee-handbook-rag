import requests
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Conversation, Message


@api_view(["GET"])
def list_conversations(request):
    return Response(
        [
            {"id": c.id, "title": c.title, "updated_at": c.updated_at}
            for c in request.user.conversations.all()
        ]
    )


@api_view(["GET", "DELETE"])
def conversation_detail(request, pk):
    conv = get_object_or_404(Conversation, pk=pk, user=request.user)
    if request.method == "DELETE":
        conv.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response(
        {
            "id": conv.id,
            "title": conv.title,
            "messages": [
                {"id": m.id, "role": m.role, "text": m.text, "sources": m.sources}
                for m in conv.messages.all()
            ],
        }
    )


@api_view(["POST"])
def ask(request):
    question = (request.data.get("question") or "").strip()
    if not question:
        return Response({"detail": "Question cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

    # Continue an existing conversation (only if it's yours), or start a new one below.
    conv = None
    conv_id = request.data.get("conversation_id")
    if conv_id:
        conv = get_object_or_404(Conversation, pk=conv_id, user=request.user)

    try:
        r = requests.post(
            f"{settings.RAG_SERVICE_URL}/query",
            json={"question": question},
            headers={"Authorization": request.headers.get("Authorization", "")},
            timeout=60,
        )
    except requests.RequestException:
        return Response({"detail": "The assistant is unreachable."}, status=status.HTTP_502_BAD_GATEWAY)
    if r.status_code != 200:
        return Response({"detail": "The assistant returned an error."}, status=status.HTTP_502_BAD_GATEWAY)
    data = r.json()

    # Only create the conversation after the answer succeeded, so failures leave no empty chats.
    if conv is None:
        conv = Conversation.objects.create(user=request.user, title=question[:60])

    Message.objects.create(conversation=conv, role=Message.Role.USER, text=question)
    Message.objects.create(
        conversation=conv,
        role=Message.Role.ASSISTANT,
        text=data["answer"],
        sources=data["sources"],
    )
    conv.save(update_fields=["updated_at"])  # moves this chat to the top of the list

    return Response(
        {
            "conversation_id": conv.id,
            "title": conv.title,
            "answer": data["answer"],
            "sources": data["sources"],
        }
    )