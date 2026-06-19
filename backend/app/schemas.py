from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AccountOut(BaseModel):
    id: str
    name: str
    account_number: Optional[str] = None
    kind: str
    status: str
    legal_business_name: Optional[str] = None
    available_balance: float
    current_balance: float
    dashboard_link: Optional[str] = None
    last_sync_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TransactionOut(BaseModel):
    id: str
    account_id: str
    amount: float
    created_at: Optional[datetime] = None
    posted_at: Optional[datetime] = None
    status: Optional[str] = None
    kind: Optional[str] = None
    bank_description: Optional[str] = None
    counterparty_name: Optional[str] = None
    external_memo: Optional[str] = None
    note: Optional[str] = None
    mercury_category: Optional[str] = None
    dashboard_link: Optional[str] = None

    model_config = {"from_attributes": True}


class TransactionList(BaseModel):
    total: int
    items: list[TransactionOut]


class SyncResult(BaseModel):
    accounts_synced: int
    total_transactions_fetched: int
    total_transactions_new: int
    errors: list[str]


class LoginRequest(BaseModel):
    username: str
    password: str
