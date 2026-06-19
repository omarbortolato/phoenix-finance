from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Category, Transaction

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    color: str | None = None


@router.get("")
def list_categories(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Union of custom categories (categories table) + distinct mercury_category values."""
    custom = {c.name for c in db.query(Category).all()}
    from_txns = {
        r[0]
        for r in db.query(distinct(Transaction.mercury_category)).all()
        if r[0]
    }
    return sorted(custom | from_txns)


@router.post("", status_code=201)
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Category name cannot be empty")
    existing = db.query(Category).filter(Category.name == name).first()
    if existing:
        return {"id": existing.id, "name": existing.name}
    cat = Category(name=name, color=body.color)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name}
