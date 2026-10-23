from django.urls import path
from . import views

urlpatterns = [
    path("documents/", views.list_documents),
    path("documents/upload/", views.upload_handbook),
]