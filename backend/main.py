from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine
import app.models  # noqa: registers all ORM models with Base.metadata before create_all
from app.routers import auth, accounts, transactions, sync
from app.routers import categories


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
app.include_router(sync.router, prefix="/sync", tags=["sync"])


@app.get("/health")
def health():
    return {"status": "ok"}
