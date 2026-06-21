"""Pure KPI calculations for the Projects module — no DB writes here."""
from datetime import datetime, timezone


def _aware(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def xirr(cash_flows: list[tuple[datetime, float]]) -> float | None:
    """XIRR via bisection on the NPV function. Returns None if no real root exists."""
    flows = [(d, a) for d, a in cash_flows if d is not None]
    if len(flows) < 2:
        return None
    flows.sort(key=lambda x: x[0])
    t0 = flows[0][0]

    if not (any(a > 0 for _, a in flows) and any(a < 0 for _, a in flows)):
        return None  # no sign change — no real IRR

    def npv(rate: float) -> float:
        total = 0.0
        for d, amt in flows:
            days = (d - t0).days
            total += amt / (1 + rate) ** (days / 365.0)
        return total

    lo, hi = -0.99, 10.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        hi = 100.0
        f_hi = npv(hi)
        if f_lo * f_hi > 0:
            return None

    mid = lo
    for _ in range(200):
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-6:
            break
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return mid


def _status_color(project, spent_so_far: float, budget_total: float) -> str:
    if not budget_total:
        return "gray"

    start = _aware(project.start_date)
    end = _aware(project.end_date_estimated)
    if not start or not end:
        if spent_so_far <= budget_total * 0.8:
            return "green"
        elif spent_so_far <= budget_total:
            return "yellow"
        return "red"

    now = datetime.now(timezone.utc)
    total_seconds = (end - start).total_seconds()
    elapsed_seconds = (now - start).total_seconds()
    time_elapsed_pct = _clamp(elapsed_seconds / total_seconds, 0, 1) if total_seconds > 0 else 1.0

    expected_spend = budget_total * time_elapsed_pct
    if spent_so_far <= expected_spend * 1.15:
        return "green"
    elif spent_so_far <= budget_total:
        return "yellow"
    return "red"


def compute_project_kpis(project, transactions: list, manual_expenses: list) -> dict:
    """
    transactions: Transaction rows tagged to this project
    manual_expenses: ProjectManualExpense rows for this project
    """
    cash_flows: list[tuple[datetime, float]] = []
    for t in transactions:
        d = _aware(t.created_at or t.posted_at)
        if d:
            cash_flows.append((d, t.amount))
    for e in manual_expenses:
        d = _aware(e.date)
        if d:
            cash_flows.append((d, e.amount))

    spent_so_far = sum(-a for _, a in cash_flows if a < 0)
    revenue_actual = sum(a for _, a in cash_flows if a > 0)
    revenue_estimate = project.revenue_estimate or 0
    revenue_remaining = revenue_estimate - revenue_actual

    budget_total = project.budget_total or 0
    budget_remaining = budget_total - spent_so_far
    pct_budget_used = (spent_so_far / budget_total * 100) if budget_total else None

    margin_estimate = revenue_estimate - budget_total
    roi_estimate_pct = (margin_estimate / budget_total * 100) if budget_total else None

    irr_flows = list(cash_flows)
    end_estimated = _aware(project.end_date_estimated)
    if end_estimated:
        irr_flows.append((end_estimated, revenue_remaining))
    estimated_irr = xirr(irr_flows)

    return {
        "spent_so_far": round(spent_so_far, 2),
        "revenue_actual": round(revenue_actual, 2),
        "revenue_remaining": round(revenue_remaining, 2),
        "budget_remaining": round(budget_remaining, 2),
        "pct_budget_used": round(pct_budget_used, 1) if pct_budget_used is not None else None,
        "margin_estimate": round(margin_estimate, 2),
        "roi_estimate_pct": round(roi_estimate_pct, 1) if roi_estimate_pct is not None else None,
        "estimated_irr_pct": round(estimated_irr * 100, 1) if estimated_irr is not None else None,
        "status_color": _status_color(project, spent_so_far, budget_total),
    }
