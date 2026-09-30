"""Other judges (LeetCode, AtCoder, CodeChef) + Codeforces, normalized to one shape for the multi-platform hub.

Every adapter returns:
  platform, handle, url, avatar, rating, maxRating, title, solved, attempted,
  difficulty: [{label, level: easy|medium|hard|None, count}],
  contests:   [{t, name, rating, delta, rank}]          oldest first, t = unix seconds
  daily:      {"YYYY-MM-DD": submissions}               local days (tz minutes), last ~371 days
  tags:       [{tag, solved}]                           most solved first
  recent:     [{t, title, url, verdict}]                newest first
  notes:      [str]                                     caveats about what the source can't tell us

Parsers are pure functions over the raw payload so they can be tested offline (test_platforms.py).
"""
import asyncio
import html
import json
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx

from cf import DB, CFError, cf, user_status

PLATFORMS = ("cf", "lc", "ac", "cc")
NAMES = {"cf": "Codeforces", "lc": "LeetCode", "ac": "AtCoder", "cc": "CodeChef"}
HANDLE_RES = {
    "cf": re.compile(r"^[A-Za-z0-9_.\-]{2,24}$"),
    "lc": re.compile(r"^[A-Za-z0-9_\-]{1,40}$"),
    "ac": re.compile(r"^[A-Za-z0-9_]{3,16}$"),
    "cc": re.compile(r"^[A-Za-z0-9_.]{1,30}$"),
}

_client = httpx.AsyncClient(timeout=40, follow_redirects=True, headers={
    "User-Agent": "Mozilla/5.0 (compatible; cf-visualizer; +https://github.com/Nandansai08/cf-visualizer)"})
_locks: dict[str, asyncio.Lock] = {}
_last: dict[str, float] = {}


class SourceError(CFError):
    pass


async def fetch(url, ttl, *, post=None, headers=None, text=False, gap=1.0):
    """Cached GET (or JSON POST) with per-host spacing. Serves stale cache over an error."""
    key = url + ("|" + json.dumps(post, sort_keys=True) if post else "")
    row = DB.execute("SELECT ts, body FROM cache WHERE key=?", (key,)).fetchone()
    if row and time.time() - row[0] < ttl:
        return row[1] if text else json.loads(row[1])
    host = urlparse(url).netloc
    lock = _locks.setdefault(host, asyncio.Lock())
    async with lock:
        wait = _last.get(host, 0) + gap - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            r = await (_client.post(url, json=post, headers=headers) if post else _client.get(url, headers=headers))
            status = r.status_code
        except httpx.HTTPError:
            status = 0
        _last[host] = time.monotonic()
    if status == 200:
        body = r.text
        if not text:
            try:
                json.loads(body)
            except ValueError:
                status = -1
        if status == 200:
            DB.execute("REPLACE INTO cache VALUES (?,?,?)", (key, time.time(), body))
            DB.commit()
            return body if text else json.loads(body)
    if row:
        return row[1] if text else json.loads(row[1])
    if status == 404:
        raise SourceError(404, "User not found")
    raise SourceError(503, f"{host} is unavailable right now" + (f" (HTTP {status})" if status > 0 else ""))


# ---------- shared helpers ----------

def local_day(t, tz_min):
    return datetime.fromtimestamp(t + tz_min * 60, timezone.utc).date()


def recent_daily(pairs, tz_min, now=None):
    """[(unix t, count)] -> {iso day: count} for the last 371 local days."""
    now = now or time.time()
    cutoff = local_day(now, tz_min) - timedelta(days=371)
    out = {}
    for t, n in pairs:
        d = local_day(t, tz_min)
        if d > cutoff and n:
            out[d.isoformat()] = out.get(d.isoformat(), 0) + int(n)
    return out


def buckets(values, edges, labels, levels):
    """Count values into [edges[i], edges[i+1]) buckets; None values go to an 'unrated' bucket if any."""
    counts = [0] * len(labels)
    unrated = 0
    for v in values:
        if v is None:
            unrated += 1
            continue
        i = sum(v >= e for e in edges[1:])
        counts[min(i, len(labels) - 1)] += 1
    rows = [{"label": l, "level": lv, "count": c} for l, lv, c in zip(labels, levels, counts)]
    if unrated:
        rows.append({"label": "unrated", "level": None, "count": unrated})
    return rows


def with_deltas(rows):
    prev = None
    for r in rows:
        if r.get("delta") is None:
            r["delta"] = None if prev is None or r["rating"] is None else r["rating"] - prev
        if r["rating"] is not None:
            prev = r["rating"]
    return rows


def base(platform, handle, url, **kw):
    return {"platform": platform, "name": NAMES[platform], "handle": handle, "url": url, "avatar": None,
            "rating": None, "maxRating": None, "title": None, "solved": 0, "attempted": None, "difficulty": [],
            "contests": [], "daily": {}, "tags": [], "recent": [], "notes": []} | kw


# ---------- Codeforces ----------

CF_EDGES = [0, 1200, 1600, 2000, 2400]
CF_LABELS = ["<1200", "1200-1599", "1600-1999", "2000-2399", "2400+"]
CF_LEVELS = ["easy", "easy", "medium", "hard", "hard"]


def parse_cf(info, hist, subs, tz_min=0, now=None):
    handle = info["handle"]
    solved, attempted, tags, recent = {}, set(), {}, []
    for s in sorted(subs, key=lambda s: s["creationTimeSeconds"]):
        p = s.get("problem", {})
        k = f"{p.get('contestId')}-{p.get('index')}"
        attempted.add(k)
        if s.get("verdict") == "OK" and k not in solved:
            solved[k] = p
            for t in p.get("tags", []):
                tags[t] = tags.get(t, 0) + 1
            recent.append({"t": s["creationTimeSeconds"], "title": f"{p.get('contestId')}{p.get('index')} · {p.get('name')}",
                           "url": f"https://codeforces.com/problemset/problem/{p.get('contestId')}/{p.get('index')}"
                           if (p.get("contestId") or 0) < 100000 else None, "verdict": "AC", "rating": p.get("rating")})
    contests = [{"t": h["ratingUpdateTimeSeconds"], "name": h["contestName"], "rating": h["newRating"],
                 "delta": h["newRating"] - h["oldRating"], "rank": h["rank"]} for h in hist]
    return base("cf", handle, f"https://codeforces.com/profile/{handle}", avatar=info.get("titlePhoto"),
                rating=info.get("rating"), maxRating=info.get("maxRating"), title=info.get("rank"),
                solved=len(solved), attempted=len(attempted),
                difficulty=buckets([p.get("rating") for p in solved.values()], CF_EDGES, CF_LABELS, CF_LEVELS),
                contests=contests, daily=recent_daily([(s["creationTimeSeconds"], 1) for s in subs], tz_min, now),
                tags=sorted(({"tag": t, "solved": n} for t, n in tags.items()), key=lambda r: -r["solved"]),
                recent=recent[::-1][:25])


async def get_cf(handle, tz_min):
    info = (await cf("user.info", 600, handles=handle))[0]
    hist = await cf("user.rating", 1800, handle=handle)
    return parse_cf(info, hist, await user_status(handle), tz_min)


# ---------- LeetCode (public GraphQL, no auth) ----------

LC_QUERY = """query($u: String!) {
  matchedUser(username: $u) {
    username
    profile { userAvatar ranking realName }
    submitStatsGlobal { acSubmissionNum { difficulty count submissions } }
    tagProblemCounts { advanced { tagName problemsSolved } intermediate { tagName problemsSolved } fundamental { tagName problemsSolved } }
    userCalendar { streak totalActiveDays submissionCalendar }
  }
  userContestRanking(username: $u) { rating attendedContestsCount globalRanking topPercentage badge { name } }
  userContestRankingHistory(username: $u) { attended rating ranking contest { title startTime } }
  recentAcSubmissionList(username: $u, limit: 20) { title titleSlug timestamp }
}"""
LC_HEADERS = {"Content-Type": "application/json", "Referer": "https://leetcode.com/"}


def lc_title(r):
    return "Guardian" if r >= 2260 else "Knight" if r >= 1850 else None


def parse_lc(data, tz_min=0, now=None):
    u = data.get("matchedUser")
    if not u:
        raise SourceError(404, "LeetCode user not found")
    ac = {x["difficulty"]: x for x in (u.get("submitStatsGlobal") or {}).get("acSubmissionNum", [])}
    diff = [{"label": d, "level": d.lower(), "count": ac.get(d, {}).get("count", 0)} for d in ("Easy", "Medium", "Hard")]
    cal = (u.get("userCalendar") or {}).get("submissionCalendar") or "{}"
    cal = json.loads(cal) if isinstance(cal, str) else cal
    tags = {}
    for level in (u.get("tagProblemCounts") or {}).values():
        for t in level or []:
            tags[t["tagName"]] = tags.get(t["tagName"], 0) + t["problemsSolved"]
    hist = [h for h in data.get("userContestRankingHistory") or [] if h.get("attended")]
    contests = with_deltas([{"t": h["contest"]["startTime"], "name": h["contest"]["title"], "rating": round(h["rating"]),
                             "delta": None, "rank": h.get("ranking")} for h in hist])
    rank = data.get("userContestRanking") or {}
    rating = round(rank["rating"]) if rank.get("rating") else None
    notes = ["Activity counts every submission LeetCode records (its calendar), not just accepted ones."]
    if rank.get("topPercentage") is not None:
        notes.append(f"Contest rating is top {rank['topPercentage']}% globally (rank {rank.get('globalRanking')}).")
    return base("lc", u["username"], f"https://leetcode.com/u/{u['username']}/",
                avatar=(u.get("profile") or {}).get("userAvatar"), rating=rating,
                maxRating=max([c["rating"] for c in contests], default=rating),
                title=(rank.get("badge") or {}).get("name") or (lc_title(rating) if rating else None),
                solved=ac.get("All", {}).get("count", sum(d["count"] for d in diff)), difficulty=diff, contests=contests,
                daily=recent_daily([(int(t), n) for t, n in cal.items()], tz_min, now),
                tags=sorted(({"tag": t, "solved": n} for t, n in tags.items() if n), key=lambda r: -r["solved"]),
                recent=[{"t": int(s["timestamp"]), "title": s["title"], "url": f"https://leetcode.com/problems/{s['titleSlug']}/",
                         "verdict": "AC"} for s in data.get("recentAcSubmissionList") or []],
                notes=notes)


async def get_lc(handle, tz_min):
    body = await fetch("https://leetcode.com/graphql", 1800, post={"query": LC_QUERY, "variables": {"u": handle}},
                       headers=LC_HEADERS, gap=0.5)
    if body.get("errors") and not (body.get("data") or {}).get("matchedUser"):
        raise SourceError(404, "LeetCode user not found")
    return parse_lc(body.get("data") or {}, tz_min)


# ---------- AtCoder (official history JSON + kenkoooo AtCoder Problems) ----------

AC_EDGES = [0, 400, 800, 1200, 1600, 2000, 2400, 2800]
AC_LABELS = ["gray", "brown", "green", "cyan", "blue", "yellow", "orange", "red"]
AC_LEVELS = ["easy", "easy", "easy", "medium", "medium", "hard", "hard", "hard"]
KENKOOOO = "https://kenkoooo.com/atcoder/atcoder-api/v3"


def ac_color(r):
    return AC_LABELS[sum(r >= e for e in AC_EDGES[1:])] if r is not None else None


def ac_diff(model):
    """AtCoder Problems clips low difficulties below 400; undo it like the site does."""
    d = (model or {}).get("difficulty")
    if d is None:
        return None
    return round(d if d >= 400 else 400 / (2.718281828 ** ((400 - d) / 400)))


def parse_ac(handle, hist, subs, models, tz_min=0, now=None):
    rated = [h for h in hist if h.get("IsRated")]
    contests = []
    for h in rated:
        t = datetime.fromisoformat(h["EndTime"]).timestamp()
        contests.append({"t": int(t), "name": h["ContestName"], "rating": h["NewRating"],
                         "delta": h["NewRating"] - h["OldRating"], "rank": h["Place"], "performance": h.get("Performance")})
    solved, recent = {}, []
    for s in sorted(subs, key=lambda s: s["epoch_second"]):
        if s.get("result") == "AC" and s["problem_id"] not in solved:
            solved[s["problem_id"]] = s
            recent.append({"t": s["epoch_second"], "title": s["problem_id"],
                           "url": f"https://atcoder.jp/contests/{s['contest_id']}/tasks/{s['problem_id']}", "verdict": "AC",
                           "rating": ac_diff(models.get(s["problem_id"]))})
    rating = contests[-1]["rating"] if contests else None
    return base("ac", handle, f"https://atcoder.jp/users/{handle}", rating=rating,
                maxRating=max((c["rating"] for c in contests), default=None), title=ac_color(rating),
                solved=len(solved), attempted=len({s["problem_id"] for s in subs}),
                difficulty=buckets([ac_diff(models.get(p)) for p in solved], AC_EDGES, AC_LABELS, AC_LEVELS),
                contests=contests, daily=recent_daily([(s["epoch_second"], 1) for s in subs], tz_min, now),
                recent=recent[::-1][:25], notes=["Solved counts and difficulty come from AtCoder Problems (kenkoooo.com)."])


async def get_ac(handle, tz_min):
    hist = await fetch(f"https://atcoder.jp/users/{handle}/history/json", 1800)
    subs, frm = [], 0
    for _ in range(40):  # 500 per page; 20k submissions is plenty for a summary
        page = await fetch(f"{KENKOOOO}/user/submissions?user={handle}&from_second={frm}", 900, gap=1.1)
        subs += page
        if len(page) < 500:
            break
        frm = max(s["epoch_second"] for s in page) + 1
    if not hist and not subs:
        raise SourceError(404, "AtCoder user not found (or no rated contests and submissions)")
    try:
        models = await fetch("https://kenkoooo.com/atcoder/resources/problem-models.json", 86400, gap=1.1)
    except SourceError:
        models = {}
    return parse_ac(handle, hist, subs, models, tz_min)


# ---------- CodeChef (profile page scrape; no public user API) ----------

CC_STARS = [(0, "1★"), (1400, "2★"), (1600, "3★"), (1800, "4★"), (2000, "5★"), (2200, "6★"), (2500, "7★")]


def cc_stars(r):
    return next((s for lo, s in reversed(CC_STARS) if r >= lo), None) if r is not None else None


def _js_var(page, name):
    m = re.search(rf"(?:var\s+)?{name}\s*=\s*(\[.*?\]|\{{.*?\}})\s*;", page, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def parse_cc(handle, page, tz_min=0, now=None):
    if re.search(r"<title>\s*(Page not found|404)", page, re.I) or "user-details-container" not in page and "rating-number" not in page:
        raise SourceError(404, "CodeChef user not found")
    num = lambda pat: (int(m.group(1)) if (m := re.search(pat, page, re.S | re.I)) else None)
    rating = num(r'class="rating-number"[^>]*>\s*(\d+)')
    max_rating = num(r"Highest Rating\s*(\d+)")
    solved = num(r"Total Problems Solved:?\s*(\d+)")
    contests = []
    for h in _js_var(page, "all_rating") or []:
        try:
            t = datetime.strptime(h["end_date"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
        except (KeyError, ValueError):
            t = datetime(int(h["getyear"]), int(h["getmonth"]), int(h["getday"]), tzinfo=timezone.utc).timestamp()
        contests.append({"t": int(t), "name": h.get("name") or h.get("code"), "rating": int(h["rating"]),
                         "delta": None, "rank": int(h["rank"]) if str(h.get("rank", "")).isdigit() else None})
    contests = with_deltas(sorted(contests, key=lambda c: c["t"]))
    pairs = []
    for d in _js_var(page, "userDailySubmissionsStats") or []:
        try:
            y, m, dd = (int(x) for x in str(d["date"]).split("-"))
            pairs.append((datetime(y, m, dd, 12, tzinfo=timezone.utc).timestamp() - tz_min * 60, d.get("value", 0)))
        except (KeyError, ValueError):
            pass
    name = re.search(r'<h1 class="h2-style">(.*?)</h1>', page, re.S)
    avatar = re.search(r'<img[^>]+class="profileImage"[^>]+src="([^"]+)"', page) or \
        re.search(r'class="user-details-container.*?<img[^>]+src="([^"]+)"', page, re.S)
    if rating is None and contests:
        rating = contests[-1]["rating"]
    return base("cc", handle, f"https://www.codechef.com/users/{handle}", rating=rating,
                maxRating=max_rating or max((c["rating"] for c in contests), default=None),
                title=cc_stars(rating) if contests else "unrated", solved=solved or 0,
                avatar=html.unescape(avatar.group(1)) if avatar else None, contests=contests,
                daily=recent_daily(pairs, 0, now), difficulty=[],
                notes=["CodeChef has no public user API; figures are read from the profile page and may lag."]
                + ([f"Display name: {html.unescape(name.group(1).strip())}"] if name else []))


async def get_cc(handle, tz_min):
    page = await fetch(f"https://www.codechef.com/users/{handle}", 1800, text=True, gap=1.5)
    return parse_cc(handle, page, tz_min)


GETTERS = {"cf": get_cf, "lc": get_lc, "ac": get_ac, "cc": get_cc}


async def get(platform, handle, tz_min=0):
    return await GETTERS[platform](handle, tz_min)


# ---------- upcoming contests across judges ----------

def parse_cf_upcoming(cs):
    return [{"platform": "cf", "name": c["name"], "start": c["startTimeSeconds"], "duration": c["durationSeconds"],
             "url": f"https://codeforces.com/contests/{c['id']}"} for c in cs if c.get("phase") == "BEFORE" and c.get("startTimeSeconds")]


def parse_lc_upcoming(data):
    return [{"platform": "lc", "name": c["title"], "start": c["startTime"], "duration": c.get("duration") or 5400,
             "url": f"https://leetcode.com/contest/{c['titleSlug']}/"} for c in (data or {}).get("topTwoContests") or []]


def parse_cc_upcoming(data):
    out = []
    for c in (data or {}).get("future_contests") or []:
        try:
            start = datetime.fromisoformat(c["contest_start_date_iso"]).timestamp()
        except (KeyError, ValueError):
            continue
        out.append({"platform": "cc", "name": c["contest_name"], "start": int(start),
                    "duration": int(c.get("contest_duration") or 0) * 60, "url": f"https://www.codechef.com/{c['contest_code']}"})
    return out


def parse_ac_upcoming(page):
    block = re.search(r'id="contest-table-upcoming".*?<tbody>(.*?)</tbody>', page, re.S)
    out = []
    for row in re.findall(r"<tr>(.*?)</tr>", block.group(1) if block else "", re.S):
        t = re.search(r"<time[^>]*>([^<]+)</time>", row)
        a = re.search(r'<a href="(/contests/[^"]+)">([^<]+)</a>', row)
        d = re.search(r"<td[^>]*>\s*(\d+):(\d\d)\s*</td>", row)
        if not (t and a):
            continue
        try:
            start = datetime.strptime(t.group(1).strip(), "%Y-%m-%d %H:%M:%S%z").timestamp()
        except ValueError:
            continue
        out.append({"platform": "ac", "name": html.unescape(a.group(2).strip()), "start": int(start),
                    "duration": (int(d.group(1)) * 3600 + int(d.group(2)) * 60) if d else None,
                    "url": "https://atcoder.jp" + a.group(1)})
    return out


async def upcoming():
    async def one(p):
        if p == "cf":
            return parse_cf_upcoming(await cf("contest.list", 600, gym="false"))
        if p == "lc":
            q = {"query": "{ topTwoContests { title titleSlug startTime duration } }"}
            return parse_lc_upcoming((await fetch("https://leetcode.com/graphql", 1800, post=q, headers=LC_HEADERS)).get("data"))
        if p == "cc":
            return parse_cc_upcoming(await fetch("https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all", 1800))
        return parse_ac_upcoming(await fetch("https://atcoder.jp/contests/", 1800, text=True))

    res = await asyncio.gather(*(one(p) for p in PLATFORMS), return_exceptions=True)
    now = time.time()
    contests = [c for r in res if isinstance(r, list) for c in r if c["start"] + (c["duration"] or 0) > now]
    errors = {p: str(r) for p, r in zip(PLATFORMS, res) if isinstance(r, Exception)}
    return {"contests": sorted(contests, key=lambda c: c["start"])[:60], "errors": errors}
