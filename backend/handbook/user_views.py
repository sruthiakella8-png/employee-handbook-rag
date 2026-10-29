"""
Admin-managed accounts. Employees are created by an admin, not by public sign-up.

  GET   /api/users/        list all accounts                     (admin only)
  POST  /api/users/        create an employee account            (admin only)
  PATCH /api/users/<id>/   activate or deactivate an account     (admin only)

Admin accounts are never created here (use `manage.py createsuperuser`), so a
compromised admin session cannot mint more admins.
"""

import secrets

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

User = get_user_model()


def serialize(u) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.first_name,
        "is_admin": u.is_staff,
        "is_active": u.is_active,
        "last_login": u.last_login,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def users(request):
    if request.method == "GET":
        return Response([serialize(u) for u in User.objects.order_by("email")])

    email = str(request.data.get("email", "")).strip().lower()
    name = str(request.data.get("name", "")).strip()[:150]
    try:
        validate_email(email)
    except ValidationError:
        return Response({"detail": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
        return Response({"detail": "An account with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    temporary_password = secrets.token_urlsafe(9)  # 12 characters, shown to the admin once
    user = User.objects.create_user(username=email, email=email, password=temporary_password, first_name=name)
    return Response(
        {"user": serialize(user), "temporary_password": temporary_password},
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def user_detail(request, pk: int):
    user = get_object_or_404(User, pk=pk)
    if user.pk == request.user.pk or user.is_staff:
        return Response({"detail": "Admin accounts can't be changed here."}, status=status.HTTP_400_BAD_REQUEST)
    if "is_active" not in request.data:
        return Response({"detail": "Send is_active as true or false."}, status=status.HTTP_400_BAD_REQUEST)
    user.is_active = bool(request.data["is_active"])
    user.save(update_fields=["is_active"])
    return Response(serialize(user))
