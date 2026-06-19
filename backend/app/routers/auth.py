from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from pydantic import BaseModel
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
        secure=settings.cookie_secure,
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
    return {"username": username}


class ForgotRequest(BaseModel):
    email: str


@router.post("/forgot-password")
def forgot_password(req: ForgotRequest, background_tasks: BackgroundTasks):
    if not settings.smtp_host:
        raise HTTPException(503, "SMTP non configurato: aggiungi SMTP_HOST e le altre variabili su Coolify.")

    incoming = req.email.lower().strip()

    # Build email→(username, password) map from env
    users = {
        settings.auth_email_omar.lower(): ("omar", settings.auth_password_omar),
        settings.auth_email_emanuel.lower(): ("emanuel", settings.auth_password_emanuel),
    }
    match = users.get(incoming)

    if match:
        username, password = match
        from app.email_client import send_email
        body = (
            f"Ciao {username.capitalize()},\n\n"
            f"Hai richiesto il recupero delle credenziali di Phoenix Finance.\n\n"
            f"Username: {username}\n"
            f"Password: {password}\n\n"
            "Se non hai richiesto questo messaggio, ignoralo.\n\n"
            "— Phoenix Finance"
        )
        background_tasks.add_task(send_email, incoming, "Phoenix Finance — recupero password", body)

    # Always return the same message to avoid user enumeration
    return {"detail": "Se l'email è registrata, riceverai le credenziali a breve."}
