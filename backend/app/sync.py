import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from dateutil.parser import parse as parse_iso

from .config import settings
from .models import Account, AccountAlert, Transaction, SyncLog
from .mercury_client import MercuryClient


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return parse_iso(val)
    except Exception:
        return None


def _is_excluded(acc_data: dict, excluded_names: list[str]) -> bool:
    legal = (acc_data.get("legalBusinessName") or "").lower()
    name = (acc_data.get("name") or "").lower()
    return any(ex in legal or ex in name for ex in excluded_names)


async def sync_all(db: Session) -> dict:
    tokens = settings.get_mercury_tokens()
    excluded = settings.get_excluded_names()

    seen_account_ids: set[str] = set()
    total_fetched = 0
    total_new = 0
    accounts_synced = 0
    errors: list[str] = []

    for token_key, token_value in tokens.items():
        client = MercuryClient(token=token_value, token_key=token_key)

        try:
            api_accounts = await client.get_accounts()
        except Exception as e:
            # Do not include the token or its value in the error message
            errors.append(f"[{token_key}] accounts fetch failed: {type(e).__name__}")
            continue

        for acc_data in api_accounts:
            # Only checking accounts, no savings
            if acc_data.get("kind") != "checking":
                continue

            if _is_excluded(acc_data, excluded):
                continue

            acc_id = acc_data["id"]
            # The same account can appear under multiple tokens — process once
            if acc_id in seen_account_ids:
                continue
            seen_account_ids.add(acc_id)

            # Upsert account record
            account = db.get(Account, acc_id)
            if not account:
                account = Account(id=acc_id)
                db.add(account)

            account.name = acc_data.get("name", "")
            account.account_number = acc_data.get("accountNumber")
            account.routing_number = acc_data.get("routingNumber")
            account.kind = acc_data.get("kind")
            account.status = acc_data.get("status")
            account.legal_business_name = acc_data.get("legalBusinessName")
            account.available_balance = acc_data.get("availableBalance", 0.0)
            account.current_balance = acc_data.get("currentBalance", 0.0)
            account.token_key = token_key
            account.dashboard_link = acc_data.get("dashboardLink")
            account.mercury_created_at = _parse_dt(acc_data.get("createdAt"))
            db.flush()

            # Incremental sync: overlap by 2 days to catch late-posted transactions
            start_date: str | None = None
            if account.last_sync_at:
                start_dt = account.last_sync_at - timedelta(days=2)
                start_date = start_dt.strftime("%Y-%m-%d")

            fetched = 0
            new_count = 0
            sync_status = "success"
            sync_error = None

            try:
                txns = await client.get_all_transactions(acc_id, start=start_date)
                fetched = len(txns)

                for t in txns:
                    txn_id = t["id"]
                    existing = db.get(Transaction, txn_id)
                    if existing:
                        # Status can change (pending→sent), keep record fresh
                        existing.status = t.get("status")
                        existing.posted_at = _parse_dt(t.get("postedAt"))
                        existing.raw_json = json.dumps(t)
                    else:
                        txn = Transaction(
                            id=txn_id,
                            account_id=acc_id,
                            amount=t.get("amount", 0.0),
                            created_at=_parse_dt(t.get("createdAt")),
                            posted_at=_parse_dt(t.get("postedAt")),
                            status=t.get("status"),
                            kind=t.get("kind"),
                            bank_description=t.get("bankDescription"),
                            counterparty_name=t.get("counterpartyName"),
                            counterparty_id=t.get("counterpartyId"),
                            external_memo=t.get("externalMemo"),
                            note=t.get("note"),
                            mercury_category=t.get("mercuryCategory"),
                            dashboard_link=t.get("dashboardLink"),
                            raw_json=json.dumps(t),
                        )
                        db.add(txn)
                        new_count += 1

                account.last_sync_at = datetime.now(timezone.utc)
                total_fetched += fetched
                total_new += new_count
                accounts_synced += 1

            except Exception as e:
                sync_status = "error"
                sync_error = f"{type(e).__name__}: {str(e)}"
                errors.append(f"[{token_key}/{acc_id[:8]}] {sync_error}")

            db.add(SyncLog(
                account_id=acc_id,
                transactions_fetched=fetched,
                transactions_new=new_count,
                status=sync_status,
                error_message=sync_error,
            ))
            db.commit()

    # Check balance-threshold alerts for all synced accounts
    if settings.smtp_host:
        _check_alerts(db, list(seen_account_ids))

    return {
        "accounts_synced": accounts_synced,
        "total_transactions_fetched": total_fetched,
        "total_transactions_new": total_new,
        "errors": errors,
    }


def _check_alerts(db: Session, account_ids: list[str]) -> None:
    from .email_client import send_email

    now = datetime.now(timezone.utc)
    cooldown = now - timedelta(hours=24)

    for acc_id in account_ids:
        alert = db.query(AccountAlert).filter(AccountAlert.account_id == acc_id).first()
        if not alert:
            continue
        account = db.get(Account, acc_id)
        if not account:
            continue
        if account.available_balance >= alert.threshold:
            continue
        if alert.last_sent_at and alert.last_sent_at > cooldown:
            continue  # already notified in the last 24h

        last4 = (account.account_number or "")[-4:] or "????"
        try:
            send_email(
                alert.email,
                f"[Phoenix Finance] Soglia di saldo raggiunta — {account.legal_business_name}",
                f"Hai raggiunto la soglia di ${alert.threshold:,.2f} "
                f"sull'account {account.legal_business_name} (••{last4}).\n\n"
                f"Saldo disponibile attuale: ${account.available_balance:,.2f}\n\n"
                "— Phoenix Finance"
            )
            alert.last_sent_at = now
            db.commit()
        except Exception:
            pass  # don't fail the sync if email fails
