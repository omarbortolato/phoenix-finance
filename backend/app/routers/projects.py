import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Account, PhaseTemplate, Project, ProjectBudgetAlert, ProjectCostItem,
    ProjectManualExpense, ProjectPhase, Transaction,
)
from app.project_kpis import compute_project_kpis

router = APIRouter()
template_router = APIRouter()

EXCLUDED_STATUSES = {"failed", "returned", "cancelled"}

# Guards against the classic <input type="date"> typing glitch where an
# incomplete year (e.g. "1") gets committed as-is, producing dates like
# year 0001 that silently break every date-range calculation downstream.
MIN_REASONABLE_YEAR = 2000


def _reject_unreasonable_date(v):
    if v and v.year < MIN_REASONABLE_YEAR:
        raise ValueError(f"Date year must be {MIN_REASONABLE_YEAR} or later")
    return v


# ─── Schemas ────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    code: str
    name: str
    project_type: str
    status: str = "active"
    location: Optional[str] = None
    acreage: Optional[float] = None
    start_date: Optional[datetime] = None
    end_date_estimated: Optional[datetime] = None
    budget_total: float = 0.0
    revenue_estimate: float = 0.0
    notes: Optional[str] = None
    bank_account_id: Optional[str] = None
    fund_collected_amount: float = 0.0
    fund_interest_rate: float = 20.0
    fund_collected_date: Optional[datetime] = None

    _check_dates = field_validator(
        "start_date", "end_date_estimated", "fund_collected_date", mode="after"
    )(_reject_unreasonable_date)


class ProjectUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    project_type: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    acreage: Optional[float] = None
    start_date: Optional[datetime] = None
    end_date_estimated: Optional[datetime] = None
    end_date_actual: Optional[datetime] = None
    budget_total: Optional[float] = None
    revenue_estimate: Optional[float] = None
    notes: Optional[str] = None
    bank_account_id: Optional[str] = None
    fund_collected_amount: Optional[float] = None
    fund_interest_rate: Optional[float] = None
    fund_collected_date: Optional[datetime] = None

    _check_dates = field_validator(
        "start_date", "end_date_estimated", "end_date_actual", "fund_collected_date", mode="after"
    )(_reject_unreasonable_date)


class PhaseCreate(BaseModel):
    name: str
    color: Optional[str] = None
    budget: float = 0.0
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    status: str = "not_started"

    _check_dates = field_validator("planned_start", "planned_end", mode="after")(_reject_unreasonable_date)


class PhaseUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    budget: Optional[float] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    status: Optional[str] = None
    pct_complete: Optional[int] = None

    _check_dates = field_validator(
        "planned_start", "planned_end", "actual_start", "actual_end", mode="after"
    )(_reject_unreasonable_date)

    @field_validator("pct_complete", mode="after")
    @classmethod
    def _clamp_pct(cls, v):
        return None if v is None else max(0, min(100, v))


class AlertUpsert(BaseModel):
    threshold_pct: float
    email: str


class ManualExpenseCreate(BaseModel):
    date: datetime
    description: str
    amount: float
    category: Optional[str] = None
    phase_id: Optional[int] = None

    _check_dates = field_validator("date", mode="after")(_reject_unreasonable_date)


class ManualExpenseUpdate(BaseModel):
    date: Optional[datetime] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    phase_id: Optional[int] = None

    _check_dates = field_validator("date", mode="after")(_reject_unreasonable_date)


class PhaseTemplateCreate(BaseModel):
    name: str
    color: Optional[str] = None
    duration_days: int = 30


class CostItemCreate(BaseModel):
    description: str
    amount: float


class CostItemUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None


# ─── Helpers ────────────────────────────────────────────────────────────────

def _project_transactions(db: Session, project_id: str) -> list[Transaction]:
    return (
        db.query(Transaction)
        .filter(Transaction.project_id == project_id, Transaction.status.notin_(EXCLUDED_STATUSES))
        .all()
    )


def _project_to_dict(db: Session, project: Project) -> dict:
    txns = _project_transactions(db, project.id)
    expenses = db.query(ProjectManualExpense).filter(ProjectManualExpense.project_id == project.id).all()
    cost_items = db.query(ProjectCostItem).filter(ProjectCostItem.project_id == project.id).all()
    kpis = compute_project_kpis(project, txns, expenses, cost_items)

    bank_balance = None
    if project.bank_account_id:
        account = db.query(Account).filter(Account.id == project.bank_account_id).first()
        if account:
            bank_balance = account.available_balance

    return {
        "id": project.id,
        "code": project.code,
        "name": project.name,
        "project_type": project.project_type,
        "status": project.status,
        "location": project.location,
        "acreage": project.acreage,
        "start_date": project.start_date,
        "end_date_estimated": project.end_date_estimated,
        "end_date_actual": project.end_date_actual,
        "budget_total": project.budget_total,
        "revenue_estimate": project.revenue_estimate,
        "notes": project.notes,
        "bank_account_id": project.bank_account_id,
        "bank_balance": bank_balance,
        "fund_collected_amount": project.fund_collected_amount,
        "fund_interest_rate": project.fund_interest_rate,
        "fund_collected_date": project.fund_collected_date,
        **kpis,
    }


def _get_or_404(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


# ─── Projects CRUD ──────────────────────────────────────────────────────────

@router.get("")
def list_projects(db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_project_to_dict(db, p) for p in projects]


@router.post("", status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    code = body.code.strip()
    if not code:
        raise HTTPException(400, "Project code is required")
    if db.query(Project).filter(Project.code == code).first():
        raise HTTPException(409, "A project with this code already exists")

    project = Project(
        id=str(uuid.uuid4()),
        code=code,
        name=body.name,
        project_type=body.project_type,
        status=body.status,
        location=body.location,
        acreage=body.acreage,
        start_date=body.start_date,
        end_date_estimated=body.end_date_estimated,
        budget_total=body.budget_total,
        revenue_estimate=body.revenue_estimate,
        notes=body.notes,
        bank_account_id=body.bank_account_id,
        fund_collected_amount=body.fund_collected_amount,
        fund_interest_rate=body.fund_interest_rate,
        fund_collected_date=body.fund_collected_date,
    )
    db.add(project)
    db.commit()
    return _project_to_dict(db, project)


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    return _project_to_dict(db, _get_or_404(db, project_id))


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    project = _get_or_404(db, project_id)
    data = body.model_dump(exclude_unset=True)

    if "code" in data and data["code"]:
        new_code = data["code"].strip()
        if db.query(Project).filter(Project.code == new_code, Project.id != project_id).first():
            raise HTTPException(409, "A project with this code already exists")
        data["code"] = new_code

    for k, v in data.items():
        setattr(project, k, v)
    db.commit()

    from app.sync import check_project_alerts
    check_project_alerts(db, [project_id])

    return _project_to_dict(db, project)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str, force: bool = False,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    """force=True untags any Mercury transactions first instead of blocking the delete —
    used when the user explicitly confirms they want the project gone for good."""
    project = _get_or_404(db, project_id)
    tagged = db.query(Transaction).filter(Transaction.project_id == project_id)
    if tagged.first():
        if not force:
            raise HTTPException(409, "Cannot delete a project with tagged transactions. Untag them first.")
        tagged.update({Transaction.project_id: None, Transaction.phase_id: None})
    db.delete(project)
    db.commit()


# ─── Project cost items ─────────────────────────────────────────────────────

@router.get("/{project_id}/cost-items")
def list_cost_items(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    return (
        db.query(ProjectCostItem)
        .filter(ProjectCostItem.project_id == project_id)
        .order_by(ProjectCostItem.created_at)
        .all()
    )


@router.post("/{project_id}/cost-items", status_code=201)
def create_cost_item(
    project_id: str, body: CostItemCreate,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    _get_or_404(db, project_id)
    item = ProjectCostItem(project_id=project_id, description=body.description, amount=body.amount)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/cost-items/{item_id}")
def update_cost_item(
    item_id: int, body: CostItemUpdate,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    item = db.query(ProjectCostItem).filter(ProjectCostItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Cost item not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/cost-items/{item_id}", status_code=204)
def delete_cost_item(item_id: int, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    db.query(ProjectCostItem).filter(ProjectCostItem.id == item_id).delete()
    db.commit()


# ─── Burndown & breakdown ───────────────────────────────────────────────────

@router.get("/{project_id}/burndown")
def burndown(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    project = _get_or_404(db, project_id)
    txns = _project_transactions(db, project_id)
    expenses = db.query(ProjectManualExpense).filter(ProjectManualExpense.project_id == project_id).all()

    daily_spend: dict = {}
    for t in txns:
        d = t.created_at or t.posted_at
        if d and t.amount < 0:
            day = d.date()
            daily_spend[day] = daily_spend.get(day, 0.0) + (-t.amount)
    for e in expenses:
        if e.date and e.amount < 0:
            day = e.date.date()
            daily_spend[day] = daily_spend.get(day, 0.0) + (-e.amount)

    if not project.start_date or not project.end_date_estimated:
        days = sorted(daily_spend.keys())
        running = 0.0
        result = []
        for d in days:
            running += daily_spend[d]
            result.append({"date": d.isoformat(), "spent_actual": round(running, 2), "budget_ideal": None})
        return result

    start = project.start_date.date()
    end = project.end_date_estimated.date()
    total_days = max((end - start).days, 1)
    today = datetime.now(timezone.utc).date()
    last_day = max(end, today)
    span_days = (last_day - start).days
    step = 7 if span_days > 365 else 1  # avoid huge payloads on multi-year projects

    budget_total = project.budget_total or 0
    result = []
    running = 0.0
    d = start
    while d <= last_day:
        # accumulate any days skipped by the step
        cursor = d - timedelta(days=step - 1) if step > 1 else d
        while cursor <= d:
            running += daily_spend.get(cursor, 0.0)
            cursor += timedelta(days=1)
        elapsed_pct = min((d - start).days / total_days, 1.0)
        result.append({
            "date": d.isoformat(),
            "spent_actual": round(running, 2),
            "budget_ideal": round(budget_total * elapsed_pct, 2),
        })
        d += timedelta(days=step)
    return result


@router.get("/{project_id}/category-breakdown")
def project_category_breakdown(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    _get_or_404(db, project_id)
    txns = _project_transactions(db, project_id)
    expenses = db.query(ProjectManualExpense).filter(ProjectManualExpense.project_id == project_id).all()

    totals: dict = {}
    for t in txns:
        if t.amount >= 0:
            continue
        cat = t.mercury_category or "Uncategorized"
        bucket = totals.setdefault(cat, {"total": 0.0, "count": 0})
        bucket["total"] += abs(t.amount)
        bucket["count"] += 1
    for e in expenses:
        if e.amount >= 0:
            continue
        cat = e.category or "Uncategorized"
        bucket = totals.setdefault(cat, {"total": 0.0, "count": 0})
        bucket["total"] += abs(e.amount)
        bucket["count"] += 1

    return sorted(
        [{"category": k, "total": round(v["total"], 2), "count": v["count"]} for k, v in totals.items()],
        key=lambda x: -x["total"],
    )


# ─── Phases ─────────────────────────────────────────────────────────────────

def _phase_to_dict(phase: ProjectPhase, spent_by_phase: dict) -> dict:
    spent = spent_by_phase.get(phase.id, 0.0)
    budget = phase.budget or 0.0
    return {
        "id": phase.id,
        "project_id": phase.project_id,
        "name": phase.name,
        "sort_order": phase.sort_order,
        "color": phase.color,
        "budget": budget,
        "planned_start": phase.planned_start,
        "planned_end": phase.planned_end,
        "actual_start": phase.actual_start,
        "actual_end": phase.actual_end,
        "status": phase.status,
        "pct_complete": phase.pct_complete,
        "spent_so_far": round(spent, 2),
        "budget_remaining": round(budget - spent, 2),
    }


@router.get("/{project_id}/phases")
def list_phases(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    phases = (
        db.query(ProjectPhase)
        .filter(ProjectPhase.project_id == project_id)
        .order_by(ProjectPhase.sort_order)
        .all()
    )
    txns = _project_transactions(db, project_id)
    expenses = db.query(ProjectManualExpense).filter(ProjectManualExpense.project_id == project_id).all()

    spent_by_phase: dict = {}
    for t in txns:
        if t.phase_id and t.amount < 0:
            spent_by_phase[t.phase_id] = spent_by_phase.get(t.phase_id, 0.0) + (-t.amount)
    for e in expenses:
        if e.phase_id and e.amount < 0:
            spent_by_phase[e.phase_id] = spent_by_phase.get(e.phase_id, 0.0) + (-e.amount)

    return [_phase_to_dict(p, spent_by_phase) for p in phases]


@router.post("/{project_id}/phases", status_code=201)
def create_phase(
    project_id: str, body: PhaseCreate,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    """Add a phase directly to this project — no template required."""
    _get_or_404(db, project_id)
    max_order = (
        db.query(func.max(ProjectPhase.sort_order))
        .filter(ProjectPhase.project_id == project_id)
        .scalar() or 0
    )
    phase = ProjectPhase(
        project_id=project_id,
        name=body.name,
        color=body.color,
        budget=body.budget,
        planned_start=body.planned_start,
        planned_end=body.planned_end,
        status=body.status,
        sort_order=max_order + 1,
    )
    db.add(phase)
    db.commit()
    db.refresh(phase)
    return _phase_to_dict(phase, {})


@router.post("/{project_id}/phases/sync-from-templates")
def sync_phases_from_templates(
    project_id: str, force: bool = False,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    """
    Create any missing phases from the global templates, chaining estimated
    dates back-to-back from the project's start date using each template's
    duration_days — so a new project's whole roadmap is pre-filled and only
    needs correcting, not building from scratch.

    force=True additionally resets any existing phase whose name matches a
    template back to the template's planned dates and clears its actual
    progress (status/actual dates/% complete) — used when the user confirms
    they want to discard what they've entered and restart from the template.
    Phases with no matching template (custom, ad-hoc ones) are never touched.
    """
    project = _get_or_404(db, project_id)
    existing = {
        p.name: p for p in db.query(ProjectPhase).filter(ProjectPhase.project_id == project_id).all()
    }
    templates = db.query(PhaseTemplate).order_by(PhaseTemplate.sort_order).all()

    cursor = project.start_date or datetime.now(timezone.utc)
    created = 0
    updated = 0
    for t in templates:
        duration = t.duration_days or 0
        planned_start = cursor
        planned_end = cursor + timedelta(days=duration)
        existing_phase = existing.get(t.name)
        if existing_phase is None:
            db.add(ProjectPhase(
                project_id=project_id, name=t.name, sort_order=t.sort_order, color=t.color,
                planned_start=planned_start, planned_end=planned_end,
            ))
            created += 1
        elif force:
            existing_phase.planned_start = planned_start
            existing_phase.planned_end = planned_end
            existing_phase.color = t.color
            existing_phase.sort_order = t.sort_order
            existing_phase.actual_start = None
            existing_phase.actual_end = None
            existing_phase.status = "not_started"
            existing_phase.pct_complete = 0
            updated += 1
        cursor = planned_end
    db.commit()
    return {"created": created, "updated": updated}


@router.patch("/{project_id}/phases/reorder")
def reorder_phases(project_id: str, items: list[dict], db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    for item in items:
        phase = (
            db.query(ProjectPhase)
            .filter(ProjectPhase.id == item["id"], ProjectPhase.project_id == project_id)
            .first()
        )
        if phase:
            phase.sort_order = item["sort_order"]
    db.commit()
    return {"ok": True}


@router.patch("/{project_id}/phases/{phase_id}")
def update_phase(
    project_id: str, phase_id: int, body: PhaseUpdate,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    phase = (
        db.query(ProjectPhase)
        .filter(ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id)
        .first()
    )
    if not phase:
        raise HTTPException(404, "Phase not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(phase, k, v)
    db.commit()
    db.refresh(phase)

    txns = _project_transactions(db, project_id)
    expenses = db.query(ProjectManualExpense).filter(ProjectManualExpense.project_id == project_id).all()
    spent = sum(-t.amount for t in txns if t.phase_id == phase_id and t.amount < 0)
    spent += sum(-e.amount for e in expenses if e.phase_id == phase_id and e.amount < 0)

    return _phase_to_dict(phase, {phase_id: spent})


@router.delete("/{project_id}/phases/{phase_id}", status_code=204)
def delete_phase(project_id: str, phase_id: int, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    db.query(ProjectPhase).filter(
        ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id
    ).delete()
    db.commit()


# ─── Budget alert ───────────────────────────────────────────────────────────

@router.get("/{project_id}/alert")
def get_alert(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    alert = db.query(ProjectBudgetAlert).filter(ProjectBudgetAlert.project_id == project_id).first()
    if not alert:
        return None
    return {"threshold_pct": alert.threshold_pct, "email": alert.email, "last_sent_at": alert.last_sent_at}


@router.put("/{project_id}/alert")
def upsert_alert(project_id: str, body: AlertUpsert, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    _get_or_404(db, project_id)
    alert = db.query(ProjectBudgetAlert).filter(ProjectBudgetAlert.project_id == project_id).first()
    if alert:
        alert.threshold_pct = body.threshold_pct
        alert.email = body.email
    else:
        alert = ProjectBudgetAlert(project_id=project_id, threshold_pct=body.threshold_pct, email=body.email)
        db.add(alert)
    db.commit()
    return {"threshold_pct": alert.threshold_pct, "email": alert.email}


@router.delete("/{project_id}/alert", status_code=204)
def delete_alert(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    db.query(ProjectBudgetAlert).filter(ProjectBudgetAlert.project_id == project_id).delete()
    db.commit()


# ─── Manual expenses ────────────────────────────────────────────────────────

@router.get("/{project_id}/manual-expenses")
def list_manual_expenses(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    return (
        db.query(ProjectManualExpense)
        .filter(ProjectManualExpense.project_id == project_id)
        .order_by(ProjectManualExpense.date.desc())
        .all()
    )


@router.post("/{project_id}/manual-expenses", status_code=201)
def create_manual_expense(
    project_id: str, body: ManualExpenseCreate,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    _get_or_404(db, project_id)
    expense = ProjectManualExpense(project_id=project_id, **body.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)

    from app.sync import check_project_alerts
    check_project_alerts(db, [project_id])

    return expense


@router.patch("/manual-expenses/{expense_id}")
def update_manual_expense(
    expense_id: int, body: ManualExpenseUpdate,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    expense = db.query(ProjectManualExpense).filter(ProjectManualExpense.id == expense_id).first()
    if not expense:
        raise HTTPException(404, "Expense not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(expense, k, v)
    db.commit()
    db.refresh(expense)

    from app.sync import check_project_alerts
    check_project_alerts(db, [expense.project_id])

    return expense


@router.delete("/manual-expenses/{expense_id}", status_code=204)
def delete_manual_expense(expense_id: int, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    expense = db.query(ProjectManualExpense).filter(ProjectManualExpense.id == expense_id).first()
    if expense:
        project_id = expense.project_id
        db.delete(expense)
        db.commit()
        from app.sync import check_project_alerts
        check_project_alerts(db, [project_id])


# ─── Phase templates (global, configurable — mounted at /phase-templates) ──

@template_router.get("")
def list_phase_templates(db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    return db.query(PhaseTemplate).order_by(PhaseTemplate.sort_order).all()


@template_router.post("", status_code=201)
def create_phase_template(body: PhaseTemplateCreate, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    max_order = db.query(func.max(PhaseTemplate.sort_order)).scalar() or 0
    template = PhaseTemplate(name=body.name, color=body.color, duration_days=body.duration_days, sort_order=max_order + 1)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@template_router.patch("/reorder")
def reorder_phase_templates(items: list[dict], db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    for item in items:
        t = db.query(PhaseTemplate).filter(PhaseTemplate.id == item["id"]).first()
        if t:
            t.sort_order = item["sort_order"]
    db.commit()
    return {"ok": True}


@template_router.patch("/{template_id}")
def update_phase_template(
    template_id: int, body: PhaseTemplateCreate,
    db: Session = Depends(get_db), _: str = Depends(get_current_user),
):
    t = db.query(PhaseTemplate).filter(PhaseTemplate.id == template_id).first()
    if not t:
        raise HTTPException(404, "Template not found")
    t.name = body.name
    t.color = body.color
    t.duration_days = body.duration_days
    db.commit()
    db.refresh(t)
    return t


@template_router.delete("/{template_id}", status_code=204)
def delete_phase_template(template_id: int, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    db.query(PhaseTemplate).filter(PhaseTemplate.id == template_id).delete()
    db.commit()
