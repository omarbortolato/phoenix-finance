import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import PhaseTemplate, Project, ProjectBudgetAlert, ProjectManualExpense, ProjectPhase, Transaction
from app.project_kpis import compute_project_kpis

router = APIRouter()
template_router = APIRouter()

EXCLUDED_STATUSES = {"failed", "returned", "cancelled"}


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


class PhaseUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    status: Optional[str] = None
    pct_complete: Optional[int] = None


class AlertUpsert(BaseModel):
    threshold_pct: float
    email: str


class ManualExpenseCreate(BaseModel):
    date: datetime
    description: str
    amount: float
    category: Optional[str] = None


class ManualExpenseUpdate(BaseModel):
    date: Optional[datetime] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None


class PhaseTemplateCreate(BaseModel):
    name: str
    color: Optional[str] = None


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
    kpis = compute_project_kpis(project, txns, expenses)
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
def delete_project(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    project = _get_or_404(db, project_id)
    if db.query(Transaction).filter(Transaction.project_id == project_id).first():
        raise HTTPException(409, "Cannot delete a project with tagged transactions. Untag them first.")
    db.delete(project)
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

@router.get("/{project_id}/phases")
def list_phases(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    return (
        db.query(ProjectPhase)
        .filter(ProjectPhase.project_id == project_id)
        .order_by(ProjectPhase.sort_order)
        .all()
    )


@router.post("/{project_id}/phases/sync-from-templates")
def sync_phases_from_templates(project_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    _get_or_404(db, project_id)
    existing_names = {
        p.name for p in db.query(ProjectPhase).filter(ProjectPhase.project_id == project_id).all()
    }
    templates = db.query(PhaseTemplate).order_by(PhaseTemplate.sort_order).all()
    created = 0
    for t in templates:
        if t.name in existing_names:
            continue
        db.add(ProjectPhase(project_id=project_id, name=t.name, sort_order=t.sort_order, color=t.color))
        created += 1
    db.commit()
    return {"created": created}


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
    return phase


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
    template = PhaseTemplate(name=body.name, color=body.color, sort_order=max_order + 1)
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
    db.commit()
    return t


@template_router.delete("/{template_id}", status_code=204)
def delete_phase_template(template_id: int, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    db.query(PhaseTemplate).filter(PhaseTemplate.id == template_id).delete()
    db.commit()
