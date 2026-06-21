from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.schemas import SyncResult
from app.sync import sync_all

router = APIRouter()


@router.post("", response_model=SyncResult)
async def trigger_sync(
    full: bool = Query(False, description="Ignore the incremental cursor and re-fetch each account's full transaction history"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Manually trigger a sync of all Mercury accounts."""
    return await sync_all(db, full=full)
