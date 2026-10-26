import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import config

bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    """Any logged-in user."""
    if creds is None:
        raise _unauthorized("Not authenticated.")
    try:
        payload = jwt.decode(creds.credentials, config.DJANGO_SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token expired.")
    except jwt.InvalidTokenError:
        raise _unauthorized("Invalid token.")
    if payload.get("token_type") != "access":
        raise _unauthorized("Invalid token.")
    return payload


def admin_only(user: dict = Depends(current_user)) -> dict:
    """Logged in AND an admin."""
    if not user.get("is_admin"):
        raise HTTPException(403, "Admins only.")
    return user