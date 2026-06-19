from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
import app.models  # noqa: registers all ORM models with Base.metadata before create_all
from app.routers import auth, accounts, transactions, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


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
app.include_router(sync.router, prefix="/sync", tags=["sync"])


@app.get("/health")
def health():
    return {"status": "ok"}
