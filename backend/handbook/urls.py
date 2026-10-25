from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView
from .auth import NimbusTokenView

urlpatterns = [
    path("documents/", views.list_documents),
    path("documents/upload/", views.upload_handbook),
    path("auth/login/", NimbusTokenView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
]