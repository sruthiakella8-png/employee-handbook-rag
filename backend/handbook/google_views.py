"""
Sign in with Google.

  POST /api/auth/google/   {"credential": "<Google ID token>"}
        -> {"access": "...", "refresh": "...", "email": "...", "is_admin": false}

The browser gets a signed ID token from Google. We verify it here (signature, expiry,
audience = our client ID) and sign the user in ONLY if an active account with that
verified email already exists. Accounts are created by admins, never by Google sign-in,
so a random Google user cannot get in.
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .auth import NimbusTokenSerializer

User = get_user_model()
log = logging.getLogger(__name__)


class GoogleLoginThrottle(AnonRateThrottle):
    rate = "30/hour"


def verify_google_token(credential: str) -> dict:
    """Return Google's verified claims, or raise ValueError if the token is not valid."""
    return id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        settings.GOOGLE_CLIENT_ID,
        clock_skew_in_seconds=10,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([GoogleLoginThrottle])
def google_login(request):
    if not settings.GOOGLE_CLIENT_ID:
        return Response({"detail": "Google sign-in isn't set up on this server."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    credential = str(request.data.get("credential", ""))
    try:
        claims = verify_google_token(credential)
    except ValueError:
        log.warning("Rejected an invalid Google ID token")
        return Response({"detail": "Google sign-in failed. Please try again."}, status=status.HTTP_401_UNAUTHORIZED)

    email = str(claims.get("email", "")).strip().lower()
    if not email or not claims.get("email_verified"):
        return Response({"detail": "Your Google email isn't verified."}, status=status.HTTP_401_UNAUTHORIZED)

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        return Response(
            {"detail": "No account found for this Google email. Ask your HR admin to add you."},
            status=status.HTTP_403_FORBIDDEN,
        )

    refresh = NimbusTokenSerializer.get_token(user)
    return Response(
        {"access": str(refresh.access_token), "refresh": str(refresh), "email": user.email, "is_admin": user.is_staff}
    )
