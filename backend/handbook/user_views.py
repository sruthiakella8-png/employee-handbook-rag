"""
Admin-managed accounts. Employees are created by an admin, not by public sign-up.

  GET   /api/users/                   list all accounts                          (admin only)
  POST  /api/users/                   create an employee account                 (admin only)
  PATCH /api/users/<id>/              activate or deactivate an account          (admin only)
  POST  /api/users/<id>/send-reset/   email an employee a password reset link    (admin only)
  POST  /api/users/import/            create many employees from a CSV file      (admin only)

Admin accounts are never created here (use `manage.py createsuperuser`), so a
compromised admin session cannot mint more admins.
"""

import csv
import io
import logging
import secrets

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .password_views import send_reset_email

User = get_user_model()
log = logging.getLogger(__name__)

MAX_IMPORT_ROWS = 200
MAX_IMPORT_BYTES = 256 * 1024
HEADER_WORDS = {"email", "e-mail", "email address", "work email"}


def serialize(u) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.first_name,
        "is_admin": u.is_staff,
        "is_active": u.is_active,
        "last_login": u.last_login,
    }


def _email_taken(email: str) -> bool:
    return User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists()


def _create_employee(email: str, name: str):
    """Create an employee with a random temporary password. Returns (user, temporary_password)."""
    # 12 characters, shown to the admin once. Never starts with "-", so a spreadsheet won't read it as a formula.
    temporary_password = secrets.token_urlsafe(9)
    while temporary_password.startswith("-"):
        temporary_password = secrets.token_urlsafe(9)
    user = User.objects.create_user(username=email, email=email, password=temporary_password, first_name=name)
    return user, temporary_password


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
    if _email_taken(email):
        return Response({"detail": "An account with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    user, temporary_password = _create_employee(email, name)
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


@api_view(["POST"])
@permission_classes([IsAdminUser])
def send_reset(request, pk: int):
    """Email an employee the same one-time reset link they would get from "Forgot password"."""
    user = get_object_or_404(User, pk=pk)
    if user.is_staff:
        return Response(
            {"detail": "Admins reset their own password from the sign-in page."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not user.is_active:
        return Response(
            {"detail": "This account is deactivated. Reactivate it first."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        send_reset_email(user)
    except Exception:
        log.exception("Could not send password reset email")
        return Response(
            {"detail": "Couldn't send the email. Check the email settings and try again."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response({"detail": f"Reset link sent to {user.email}."})


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser])
def import_users(request):
    """
    Create employees from a CSV with the email in the first column and an optional name in the second.
    A header row is skipped. Rows that can't be created are reported, not fatal, so a partly bad
    file still creates the good rows.
    """
    file = request.FILES.get("file")
    if file is None:
        return Response({"detail": "Send the file as form field 'file'."}, status=status.HTTP_400_BAD_REQUEST)
    if file.size > MAX_IMPORT_BYTES:
        return Response({"detail": "That file is too large (limit 256 KB)."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        text = file.read().decode("utf-8-sig")  # utf-8-sig also strips the BOM Excel adds
    except UnicodeDecodeError:
        return Response({"detail": "Save the file as UTF-8 CSV and try again."}, status=status.HTTP_400_BAD_REQUEST)

    rows = [(number, row) for number, row in enumerate(csv.reader(io.StringIO(text)), start=1) if any(c.strip() for c in row)]
    if rows and rows[0][1][0].strip().lower() in HEADER_WORDS:
        rows = rows[1:]
    if not rows:
        return Response({"detail": "The file has no rows to import."}, status=status.HTTP_400_BAD_REQUEST)
    if len(rows) > MAX_IMPORT_ROWS:
        return Response(
            {"detail": f"Too many rows ({len(rows)}). Import at most {MAX_IMPORT_ROWS} at a time."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created, skipped, seen = [], [], set()
    for number, row in rows:
        email = row[0].strip().lower()
        name = row[1].strip()[:150] if len(row) > 1 else ""
        try:
            validate_email(email)
        except ValidationError:
            skipped.append({"row": number, "email": email, "reason": "Not a valid email address."})
            continue
        if email in seen:
            skipped.append({"row": number, "email": email, "reason": "Listed more than once in this file."})
            continue
        seen.add(email)
        if _email_taken(email):
            skipped.append({"row": number, "email": email, "reason": "An account with this email already exists."})
            continue
        user, temporary_password = _create_employee(email, name)
        created.append({"email": user.email, "name": user.first_name, "temporary_password": temporary_password})

    return Response({"created": created, "skipped": skipped})
