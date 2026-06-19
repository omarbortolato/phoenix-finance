from fastapi import APIRouter, Depends, HTTPException, Response, status
from app.schemas import LoginRequest
from app.auth import verify_password, create_access_token, get_current_user
from app.config import settings

router = APIRouter()


@router.post("/login")
def login(req: LoginRequest, response: Response):
    if not verify_password(req.username, req.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(req.username)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,  # set COOKIE_SECURE=false for local HTTP dev
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
    )
    return {"username": req.username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"detail": "Logged out"}


@router.get("/me")
def me(username: str = Depends(get_current_user)):
    """Frontend uses this to check if the session is still valid."""
    return {"username": username}
