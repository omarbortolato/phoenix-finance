import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

# Ensure ./data/ exists for the SQLite file (Docker: workdir is /app)
os.makedirs("./data", exist_ok=True)

# check_same_thread=False: SQLite default rejects cross-thread connections,
# but FastAPI's thread pool needs this for sync endpoints.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a DB session and closes it on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
