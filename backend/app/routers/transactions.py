from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, distinct
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Transaction, Category
from app.schemas import TransactionList, TransactionOut

router = APIRouter()

EXCLUDED_STATUSES = {"failed", "returned", "cancelled"}


@router.get("", response_model=TransactionList)
def list_transactions(
    account_id: Optional[str] = Query(None),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    category: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Substring match on counterparty or description"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    q = db.query(Transaction).filter(Transaction.status.notin_(EXCLUDED_STATUSES))

    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if start:
        q = q.filter(Transaction.created_at >= start)
    if end:
        q = q.filter(Transaction.created_at <= end)
    if category:
        q = q.filter(Transaction.mercury_category == category)
    if project_id:
        q = q.filter(Transaction.project_id == project_id)
    if search:
        term = f"%{search}%"
        q = q.filter(
            Transaction.counterparty_name.ilike(term)
            | Transaction.bank_description.ilike(term)
        )

    total = q.count()
    items = q.order_by(desc(Transaction.created_at)).offset(offset).limit(limit).all()
    return {"total": total, "items": items}


class CategoryPatch(BaseModel):
    category: str | None = None


@router.patch("/{txn_id}/category")
def set_category(
    txn_id: str,
    body: CategoryPatch,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    txn.mercury_category = body.category or None
    db.commit()
    return {"id": txn.id, "mercury_category": txn.mercury_category}


class ProjectPatch(BaseModel):
    project_id: str | None = None


@router.patch("/{txn_id}/project")
def set_project(
    txn_id: str,
    body: ProjectPatch,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Tag (or untag) a transaction to a project deal."""
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    old_project_id = txn.project_id
    txn.project_id = body.project_id or None
    db.commit()

    from app.sync import check_project_alerts
    affected = [pid for pid in {old_project_id, txn.project_id} if pid]
    if affected:
        check_project_alerts(db, affected)

    return {"id": txn.id, "project_id": txn.project_id}


@router.get("/summary")
def monthly_summary(
    account_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Monthly aggregates by category — foundation for the P&L view.
    NOTE: func.strftime is SQLite-specific. For Postgres migration replace with
    func.to_char(Transaction.created_at, 'YYYY-MM').
    """
    q = db.query(
        func.strftime("%Y-%m", Transaction.created_at).label("month"),
        Transaction.mercury_category,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).filter(Transaction.status.notin_(EXCLUDED_STATUSES))

    if account_id:
        q = q.filter(Transaction.account_id == account_id)

    rows = q.group_by("month", Transaction.mercury_category).order_by("month").all()

    summary: dict = {}
    for row in rows:
        month = row.month or "unknown"
        cat = row.mercury_category or "Uncategorized"
        summary.setdefault(month, {})[cat] = {
            "total": round(float(row.total), 2),
            "count": row.count,
        }
    return summary


@router.get("/category-breakdown")
def category_breakdown(
    account_id: Optional[str] = Query(None),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Spending breakdown by category for the pie/bar chart in the Cockpit."""
    q = db.query(
        Transaction.mercury_category,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).filter(
        Transaction.status.notin_(EXCLUDED_STATUSES),
        Transaction.amount < 0,  # only expenses
    )

    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if start:
        q = q.filter(Transaction.created_at >= start)
    if end:
        q = q.filter(Transaction.created_at <= end)

    rows = q.group_by(Transaction.mercury_category).order_by(func.sum(Transaction.amount)).all()

    return [
        {
            "category": row.mercury_category or "Uncategorized",
            "total": round(abs(float(row.total)), 2),
            "count": row.count,
        }
        for row in rows
    ]
