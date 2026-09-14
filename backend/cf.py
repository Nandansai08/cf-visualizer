"""Codeforces API client: SQLite cache + global rate limit (CF allows ~1 req / 2 s per IP)."""
import asyncio
import json
import os
import sqlite3
import time
from pathlib import Path

import httpx

# ponytail: serverless (Vercel) only has a writable /tmp, and it's per-instance; a shared cache (Redis/KV) if cold loads hurt
CACHE_DIR = Path(os.environ.get("CACHE_DIR") or ("/tmp" if os.environ.get("VERCEL") else Path(__file__).parent))
DB = sqlite3.connect(CACHE_DIR / "cache.db", check_same_thread=False)
DB.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, ts REAL, body TEXT)")

_client = httpx.AsyncClient(timeout=90, headers={"User-Agent": "cf-visualizer"})
_lock = asyncio.Lock()
_last = 0.0


class CFError(Exception):
    def __init__(self, status: int, msg: str):
        super().__init__(msg)
        self.status = status


def _cached(key):
    return DB.execute("SELECT ts, body FROM cache WHERE key=?", (key,)).fetchone()


async def cf(method: str, ttl: int, **params):
    """Return `result` of a CF API call, served from cache when younger than ttl seconds."""
    global _last
    key = method + "?" + "&".join(f"{k}={v}" for k, v in sorted(params.items())).lower()
    row = _cached(key)
    if row and time.time() - row[0] < ttl:
        return json.loads(row[1])

    # ponytail: one global lock serializes every outbound call; that IS the CF per-IP limit.
    async with _lock:
        row = _cached(key)  # another waiter may have filled it
        if row and time.time() - row[0] < ttl:
            return json.loads(row[1])
        comment = "Codeforces is unavailable right now"
        for _ in range(3):
            wait = _last + 2.1 - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                r = await _client.get(f"https://codeforces.com/api/{method}", params=params)
            except httpx.HTTPError:
                _last = time.monotonic()
                continue
            _last = time.monotonic()
            try:
                data = r.json()
            except ValueError:  # CF serves HTML when down / behind Cloudflare challenge
                data = {}
            if data.get("status") == "OK":
                DB.execute("REPLACE INTO cache VALUES (?,?,?)", (key, time.time(), json.dumps(data["result"])))
                DB.commit()
                return data["result"]
            comment = data.get("comment") or f"Codeforces returned HTTP {r.status_code}"
            if "limit exceeded" in comment.lower() or r.status_code >= 500 or not data:
                continue
            # "handles: User with handle foo not found" -> "User with handle foo not found"
            msg = comment.split(": ", 1)[-1]
            raise CFError(404 if "not found" in comment.lower() else 400, msg)
        if row:  # stale data beats an error page
            return json.loads(row[1])
        raise CFError(503, comment)


async def user_status(handle: str):
    out, start = [], 1
    while True:
        page = await cf("user.status", 300, handle=handle, **{"from": start}, count=10000)
        out += page
        if len(page) < 10000:
            return out
        start += 10000
