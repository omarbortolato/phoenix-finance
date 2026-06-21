from sqlalchemy import Boolean, Column, String, Float, Integer, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import relationship
from .database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    account_number = Column(String)
    routing_number = Column(String)
    kind = Column(String)
    status = Column(String)
    legal_business_name = Column(String)
    available_balance = Column(Float, default=0.0)
    current_balance = Column(Float, default=0.0)
    token_key = Column(String)
    dashboard_link = Column(String)
    mercury_created_at = Column(DateTime(timezone=True))
    last_sync_at = Column(DateTime(timezone=True))
    sort_order = Column(Integer, default=0)
    is_excluded = Column(Boolean, default=False)

    transactions = relationship("Transaction", back_populates="account")
    sync_logs = relationship("SyncLog", back_populates="account")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), index=True)
    posted_at = Column(DateTime(timezone=True))
    status = Column(String)
    kind = Column(String)
    bank_description = Column(String)
    counterparty_name = Column(String)
    counterparty_id = Column(String)
    external_memo = Column(String)
    note = Column(String)
    mercury_category = Column(String, index=True)
    dashboard_link = Column(String)
    raw_json = Column(Text)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True, index=True)

    account = relationship("Account", back_populates="transactions")
    project = relationship("Project", back_populates="transactions")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    color = Column(String)


class AccountAlert(Base):
    """Balance-threshold email alert per account."""
    __tablename__ = "account_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False, unique=True)
    threshold = Column(Float, nullable=False)
    email = Column(String, nullable=False)
    last_sent_at = Column(DateTime(timezone=True))

    account = relationship("Account")


class Project(Base):
    """A land entitlement or minor subdivision deal."""
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    code = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    project_type = Column(String, nullable=False)  # entitlement | minor_subdivision
    status = Column(String, default="active")  # active | on_hold | completed | cancelled
    location = Column(String)
    acreage = Column(Float)
    start_date = Column(DateTime(timezone=True))
    end_date_estimated = Column(DateTime(timezone=True))
    end_date_actual = Column(DateTime(timezone=True))
    budget_total = Column(Float, default=0.0)
    revenue_estimate = Column(Float, default=0.0)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transactions = relationship("Transaction", back_populates="project")
    phases = relationship("ProjectPhase", back_populates="project", cascade="all, delete-orphan")
    manual_expenses = relationship("ProjectManualExpense", back_populates="project", cascade="all, delete-orphan")


class PhaseTemplate(Base):
    """Global, configurable phase template used to seed new projects' Gantt."""
    __tablename__ = "phase_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    color = Column(String)


class ProjectPhase(Base):
    """A phase instance attached to a specific project, editable independently of the template."""
    __tablename__ = "project_phases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    color = Column(String)
    planned_start = Column(DateTime(timezone=True))
    planned_end = Column(DateTime(timezone=True))
    actual_start = Column(DateTime(timezone=True))
    actual_end = Column(DateTime(timezone=True))
    status = Column(String, default="not_started")  # not_started | in_progress | completed | blocked
    pct_complete = Column(Integer, default=0)

    project = relationship("Project", back_populates="phases")


class ProjectBudgetAlert(Base):
    """Budget-threshold email alert per project."""
    __tablename__ = "project_budget_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, unique=True)
    threshold_pct = Column(Float, nullable=False)
    email = Column(String, nullable=False)
    last_sent_at = Column(DateTime(timezone=True))

    project = relationship("Project")


class ProjectManualExpense(Base):
    """Cost or income not present in Mercury (pre-account, cash, other bank)."""
    __tablename__ = "project_manual_expenses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)  # negative = cost, positive = income
    category = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="manual_expenses")


class SyncLog(Base):
    __tablename__ = "sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    synced_at = Column(DateTime(timezone=True), server_default=func.now())
    transactions_fetched = Column(Integer, default=0)
    transactions_new = Column(Integer, default=0)
    status = Column(String)
    error_message = Column(Text)

    account = relationship("Account", back_populates="sync_logs")
