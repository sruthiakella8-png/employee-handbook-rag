"""
Forgot / reset password.

  POST /api/auth/forgot-password/   {"email": "..."}                      -> always 200
  POST /api/auth/reset-password/    {"uid": "...", "token": "...", "password": "..."}

How it works:
  1. The user enters their email. If an active account exists, we email a link containing
     a one-time token (Django's built-in token generator).
  2. The token is a signed hash of the user's id, current password hash and last login time,
     so it stops working as soon as the password changes or the user logs in, and it expires
     after PASSWORD_RESET_TIMEOUT seconds (set in settings.py).
  3. The reset endpoint checks the token, validates the new password against Django's
     password rules, and saves it.

The forgot-password endpoint gives the same answer whether or not the email exists, so it
cannot be used to find out who has an account. It is also rate limited per IP.
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

User = get_user_model()
log = logging.getLogger(__name__)

GENERIC_REPLY = {"detail": "If an account with that email exists, we've sent a link to reset the password."}
BAD_LINK = {"detail": "This reset link is invalid or has expired. Please request a new one."}


class ForgotPasswordThrottle(AnonRateThrottle):
    rate = "5/hour"


def _reset_link(user) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ForgotPasswordThrottle])
def forgot_password(request):
    email = str(request.data.get("email", "")).strip().lower()
    user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
    if user:
        link = _reset_link(user)
        if settings.DEBUG:
            print(f"\n[dev] Password reset link for {user.email}:\n{link}\n", flush=True)
        minutes = settings.PASSWORD_RESET_TIMEOUT // 60
        body = (
            "Hello,\n\n"
            "Someone asked to reset the password for your Nimbus HR Assistant account.\n"
            f"Use this link within {minutes} minutes to choose a new password:\n\n"
            f"{link}\n\n"
            "If you didn't ask for this, you can ignore this email; your password has not changed.\n"
        )
        try:
            send_mail("Reset your Nimbus HR Assistant password", body, settings.DEFAULT_FROM_EMAIL, [user.email])
        except Exception:
            # Never tell the caller: a different reply would reveal that the account exists.
            log.exception("Could not send password reset email")
    return Response(GENERIC_REPLY)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def reset_password(request):
    uid = str(request.data.get("uid", ""))
    token = str(request.data.get("token", ""))
    password = str(request.data.get("password", ""))

    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
    if not default_token_generator.check_token(user, token):
        return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(password, user)
    except ValidationError as err:
        return Response({"detail": " ".join(err.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(password)
    user.save(update_fields=["password"])
    return Response({"detail": "Your password has been changed. You can sign in now."})
