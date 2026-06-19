import secrets
from typing import Optional
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from fastapi import Cookie, HTTPException, status
from .config import settings

USERS = {
    "omar": lambda: settings.auth_password_omar,
    "emanuel": lambda: settings.auth_password_emanuel,
}


def verify_password(username: str, password: str) -> bool:
    if username not in USERS:
        # Always run a comparison to prevent timing-based username enumeration
        secrets.compare_digest(password, "")
        return False
    return secrets.compare_digest(password, USERS[username]())


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.auth_token_expire_hours)
    return jwt.encode(
        {"sub": username, "exp": expire},
        settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
    )


def get_current_user(access_token: Optional[str] = Cookie(default=None)) -> str:
    """FastAPI dependency: validates the JWT cookie and returns the username."""
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not access_token:
        raise exc
    try:
        payload = jwt.decode(
            access_token,
            settings.auth_secret_key,
            algorithms=[settings.auth_algorithm],
        )
        username: str = payload.get("sub", "")
        if username not in USERS:
            raise exc
        return username
    except JWTError:
        raise exc
