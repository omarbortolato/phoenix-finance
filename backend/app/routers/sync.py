from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.schemas import SyncResult
from app.sync import sync_all

router = APIRouter()


@router.post("", response_model=SyncResult)
async def trigger_sync(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Manually trigger a full sync of all Mercury accounts."""
    return await sync_all(db)
