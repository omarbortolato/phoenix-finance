import httpx
from typing import Optional

MERCURY_BASE_URL = "https://api.mercury.com/api/v1"


class MercuryClient:
    def __init__(self, token: str, token_key: str):
        self.token_key = token_key
        # Token stored only in headers, never logged or returned
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def get_accounts(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{MERCURY_BASE_URL}/accounts", headers=self._headers)
            r.raise_for_status()
            return r.json().get("accounts", [])

    async def _get_transactions_page(
        self,
        account_id: str,
        limit: int,
        offset: int,
        start: Optional[str],
    ) -> dict:
        params: dict = {"limit": limit, "offset": offset}
        if start:
            params["start"] = start
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get(
                f"{MERCURY_BASE_URL}/account/{account_id}/transactions",
                headers=self._headers,
                params=params,
            )
            r.raise_for_status()
            return r.json()

    async def get_all_transactions(
        self,
        account_id: str,
        start: Optional[str] = None,
    ) -> list[dict]:
        """
        Fetch all transactions with automatic offset pagination.
        Terminates when a page comes back shorter than `limit` — relying on a
        `total` field from the API is unsafe (it may be absent or stale, which
        previously caused pagination to stop after the very first page).
        """
        all_txns: list[dict] = []
        offset = 0
        limit = 500  # Mercury's max per page

        while True:
            data = await self._get_transactions_page(account_id, limit, offset, start)
            batch = data.get("transactions", [])
            all_txns.extend(batch)
            offset += len(batch)
            if len(batch) < limit:
                break

        return all_txns
