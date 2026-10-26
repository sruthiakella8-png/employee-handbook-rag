from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from .chat_views import ask, conversation_detail, list_conversations
from .auth import NimbusTokenView

urlpatterns = [
    path("documents/", views.list_documents),
    path("documents/upload/", views.upload_handbook),
    path("auth/login/", NimbusTokenView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("conversations/", list_conversations),
    path("conversations/ask/", ask),
    path("conversations/<int:pk>/", conversation_detail),
]