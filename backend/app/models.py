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

    account = relationship("Account", back_populates="transactions")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    color = Column(String)


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
