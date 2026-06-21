from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine
import app.models  # noqa: registers all ORM models with Base.metadata before create_all
from app.routers import auth, accounts, transactions, sync
from app.routers import categories, projects


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Lightweight migrations for columns added after initial deploy
    _migrate()
    yield


def _migrate():
    migrations = [
        "ALTER TABLE accounts ADD COLUMN sort_order INTEGER DEFAULT 0",
        "ALTER TABLE accounts ADD COLUMN is_excluded BOOLEAN DEFAULT 0",
        "CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT)",
        "CREATE TABLE IF NOT EXISTS account_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id), threshold REAL NOT NULL, email TEXT NOT NULL, last_sent_at DATETIME)",
        "ALTER TABLE transactions ADD COLUMN project_id TEXT REFERENCES projects(id)",
        "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, project_type TEXT NOT NULL, status TEXT DEFAULT 'active', location TEXT, acreage REAL, start_date DATETIME, end_date_estimated DATETIME, end_date_actual DATETIME, budget_total REAL DEFAULT 0, revenue_estimate REAL DEFAULT 0, notes TEXT, created_at DATETIME)",
        "CREATE TABLE IF NOT EXISTS phase_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, color TEXT, budget REAL DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS project_phases (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, color TEXT, budget REAL DEFAULT 0, planned_start DATETIME, planned_end DATETIME, actual_start DATETIME, actual_end DATETIME, status TEXT DEFAULT 'not_started', pct_complete INTEGER DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS project_budget_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL UNIQUE REFERENCES projects(id), threshold_pct REAL NOT NULL, email TEXT NOT NULL, last_sent_at DATETIME)",
        "CREATE TABLE IF NOT EXISTS project_manual_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), date DATETIME NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, category TEXT, phase_id INTEGER REFERENCES project_phases(id), created_at DATETIME)",
        "ALTER TABLE phase_templates ADD COLUMN budget REAL DEFAULT 0",
        "ALTER TABLE project_phases ADD COLUMN budget REAL DEFAULT 0",
        "ALTER TABLE transactions ADD COLUMN phase_id INTEGER REFERENCES project_phases(id)",
        "ALTER TABLE project_manual_expenses ADD COLUMN phase_id INTEGER REFERENCES project_phases(id)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column/table already exists


app = FastAPI(title="Phoenix Finance API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
app.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
app.include_router(categories.router, prefix="/categories", tags=["categories"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(projects.template_router, prefix="/phase-templates", tags=["phase-templates"])
app.include_router(sync.router, prefix="/sync", tags=["sync"])


@app.get("/health")
def health():
    return {"status": "ok"}
