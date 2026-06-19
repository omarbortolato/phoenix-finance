from datetime import date, timedelta, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Account, Transaction
from app.schemas import AccountOut

router = APIRouter()


@router.get("", response_model=list[AccountOut])
def list_accounts(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    return (
        db.query(Account)
        .filter(Account.kind == "checking")
        .order_by(Account.legal_business_name)
        .all()
    )


@router.get("/totals")
def totals(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Aggregate balance across all checking accounts — used by the Cockpit header."""
    accounts = db.query(Account).filter(Account.kind == "checking").all()
    return {
        "total_available": round(sum(a.available_balance for a in accounts), 2),
        "total_current": round(sum(a.current_balance for a in accounts), 2),
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "legal_business_name": a.legal_business_name,
                "available_balance": a.available_balance,
            }
            for a in accounts
        ],
    }


@router.get("/balance-history")
def balance_history(
    account_id: Optional[str] = Query(None, description="Filter to a single account"),
    days: int = Query(90, ge=7, le=365),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Reconstructs a daily balance series for the line chart.
    Strategy: start from current known balance, then subtract forward movements
    using posted transactions to back-fill the series.
    Only 'sent' transactions are included (not pending/failed).
    """
    accounts = db.query(Account).filter(Account.kind == "checking")
    if account_id:
        accounts = accounts.filter(Account.id == account_id)
    accounts = accounts.all()

    current_balance = sum(a.current_balance for a in accounts)
    account_ids = [a.id for a in accounts]

    start_dt = datetime.now(timezone.utc) - timedelta(days=days)

    # Daily net amounts from posted transactions in the window
    rows = (
        db.query(
            func.date(Transaction.posted_at).label("day"),
            func.sum(Transaction.amount).label("net"),
        )
        .filter(
            Transaction.account_id.in_(account_ids),
            Transaction.status == "sent",
            Transaction.posted_at >= start_dt,
        )
        .group_by("day")
        .all()
    )

    daily_net = {row.day: float(row.net) for row in rows if row.day}

    # Base = current balance minus everything that happened in the window
    period_sum = sum(daily_net.values())
    running = current_balance - period_sum

    today = date.today()
    start_date = today - timedelta(days=days)
    result = []
    for i in range(days + 1):
        d = (start_date + timedelta(days=i)).isoformat()
        running += daily_net.get(d, 0.0)
        result.append({"date": d, "balance": round(running, 2)})

    return result
