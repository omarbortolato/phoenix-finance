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
    identifier: str  # username oppure email


@router.post("/forgot-password")
def forgot_password(req: ForgotRequest, background_tasks: BackgroundTasks):
    if not settings.smtp_host:
        raise HTTPException(503, "SMTP non configurato: aggiungi SMTP_HOST e le altre variabili su Coolify.")

    incoming = req.identifier.lower().strip()

    # username → (recovery_email, password)
    by_username = {
        "omar": (settings.auth_email_omar, settings.auth_password_omar),
        "emanuel": (settings.auth_email_emanuel, settings.auth_password_emanuel),
    }
    # email → username (only if email is configured)
    by_email = {
        v[0].lower(): k
        for k, v in by_username.items()
        if v[0]
    }

    # Resolve: try username first, then email
    if incoming in by_username:
        username = incoming
    elif incoming in by_email:
        username = by_email[incoming]
    else:
        return {"detail": "Se i dati sono corretti, riceverai le credenziali a breve."}

    to_email, password = by_username[username]
    if not to_email:
        raise HTTPException(422, "Nessuna email configurata per questo account. Aggiungi AUTH_EMAIL_OMAR o AUTH_EMAIL_EMANUEL su Coolify.")

    from app.email_client import send_email
    body = (
        f"Ciao {username.capitalize()},\n\n"
        f"Hai richiesto il recupero delle credenziali di Phoenix Finance.\n\n"
        f"Username: {username}\n"
        f"Password: {password}\n\n"
        "Se non hai richiesto questo messaggio, ignoralo.\n\n"
        "— Phoenix Finance"
    )
    background_tasks.add_task(send_email, to_email, "Phoenix Finance — recupero password", body)
    return {"detail": "Credenziali inviate all'email associata all'account."}
