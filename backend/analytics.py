"""Pure analytics over raw Codeforces payloads. No I/O here."""
import math
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

TIERS = [(1200, "pupil"), (1400, "specialist"), (1600, "expert"), (1900, "candidate master"),
         (2100, "master"), (2300, "international master"), (2400, "grandmaster"),
         (2600, "international grandmaster"), (3000, "legendary grandmaster")]
PRIOR = 3  # pseudo-attempts pulling sparse tags toward the user's overall solve rate
PENALTY = [1400, 900, 550, 300, 150, 50]  # hidden offset of displayed rating after k contests (post-2020 system)


def pkey(p):
    return f"{p.get('contestId') or p.get('problemsetName', '')}-{p['index']}"


def frame(subs):
    cols = ["id", "key", "name", "rating", "tags", "verdict", "lang", "t", "contestId", "index"]
    df = pd.DataFrame([{
        "id": s["id"], "key": pkey(s["problem"]), "name": s["problem"].get("name", ""),
        "rating": s["problem"].get("rating"), "tags": s["problem"].get("tags", []),
        "verdict": s.get("verdict", "TESTING"), "lang": s.get("programmingLanguage", ""),
        "t": s["creationTimeSeconds"], "contestId": s["problem"].get("contestId"), "index": s["problem"]["index"],
    } for s in subs], columns=cols)
    df["rating"] = pd.to_numeric(df["rating"], errors="coerce")
    df["ok"] = df["verdict"] == "OK"
    return df


def problems(df):
    if df.empty:
        return pd.DataFrame(columns=["key", "solved", "rating", "tags", "name"])
    return (df.sort_values("t").groupby("key", sort=False)
            .agg(solved=("ok", "any"), rating=("rating", "first"), tags=("tags", "first"), name=("name", "first"))
            .reset_index())


def _num(x):
    return None if x is None or pd.isna(x) else round(float(x))


def tag_table(p):
    overall = float(p["solved"].mean()) if len(p) else 0.0
    e = p.explode("tags").dropna(subset=["tags"])
    e = e[e["tags"] != "*special"]  # CF meta-tag, not a topic
    if e.empty:
        return [], overall
    g = e.groupby("tags").agg(attempted=("key", "size"), solved=("solved", "sum"))
    avg = e[e["solved"].astype(bool)].groupby("tags")["rating"].mean()
    rows = [{
        "tag": tag, "attempted": int(r.attempted), "solved": int(r.solved),
        "ratio": round(r.solved / r.attempted, 3),
        "score": round((r.solved + PRIOR * overall) / (r.attempted + PRIOR), 3),
        "avgSolvedRating": _num(avg.get(tag)),
    } for tag, r in g.iterrows()]
    return sorted(rows, key=lambda r: -r["solved"]), overall


def weak_topics(rows, overall, min_attempts=3):
    cand = sorted((r for r in rows if r["attempted"] >= min_attempts), key=lambda r: r["score"])
    weak = [r["tag"] for r in cand if r["score"] < overall - 0.05]
    relative = not weak
    if relative:  # nothing clearly below average: surface the lowest few, labelled as relative
        weak = [r["tag"] for r in cand[:3]]
    for r in rows:
        r["weak"] = r["tag"] in weak
    return {"weak": weak, "relative": relative, "overall": round(overall, 3), "minAttempts": min_attempts,
            "ranked": [r for r in cand]}


def cluster_tags(rows):
    rows = [r for r in rows if r["attempted"] >= 2]
    if len(rows) < 6:
        return []  # too sparse for clustering to mean anything
    rated = [r["avgSolvedRating"] for r in rows if r["avgSolvedRating"]]
    fill = min(rated) if rated else 0
    X = np.array([[r["score"], math.log1p(r["attempted"]), r["avgSolvedRating"] or fill] for r in rows], float)
    X = (X - X.mean(0)) / (X.std(0) + 1e-9)
    labels = KMeans(3, n_init=10, random_state=0).fit_predict(X)
    # strength = solve rate counts double, then volume and difficulty of solved problems
    strength = [2 * X[labels == c, 0].mean() + X[labels == c, 1].mean() + X[labels == c, 2].mean() for c in range(3)]
    out = []
    for name, c in zip(["Strength", "Developing", "Weak"], np.argsort(strength)[::-1]):
        members = [rows[i] for i in np.flatnonzero(labels == c)]
        rs = [m["avgSolvedRating"] for m in members if m["avgSolvedRating"]]
        out.append({
            "label": name,
            "tags": [m["tag"] for m in sorted(members, key=lambda m: -m["attempted"])],
            "avgRatio": round(float(np.mean([m["ratio"] for m in members])), 3),
            "avgSolvedRating": round(float(np.mean(rs))) if rs else None,
            "attempted": int(sum(m["attempted"] for m in members)),
        })
    return out


def streaks(days, today):
    """(current, longest) run of consecutive dates. Current may end yesterday (today isn't over)."""
    if not days:
        return 0, 0
    ds = sorted(days)
    longest = cur = 1
    for a, b in zip(ds, ds[1:]):
        cur = cur + 1 if (b - a).days == 1 else 1
        longest = max(longest, cur)
    d = today if today in days else today - timedelta(days=1)
    current = 0
    while d in days:
        current += 1
        d -= timedelta(days=1)
    return current, longest


def activity(df, tz_min, now):
    today = datetime.fromtimestamp(now + tz_min * 60, timezone.utc).date()
    if df.empty:
        return {"daily": {}, "current": 0, "longest": 0, "currentSolve": 0, "longestSolve": 0, "activeDays": 0}
    local = pd.to_datetime(df["t"] + tz_min * 60, unit="s").dt.date
    all_days, ac_days = set(local), set(local[df["ok"]])
    cutoff = today - timedelta(days=371)
    recent = local > cutoff
    daily = local[recent].value_counts()
    daily_ac = local[recent & df["ok"]].value_counts()
    cur, lng = streaks(all_days, today)
    cur_s, lng_s = streaks(ac_days, today)
    return {"daily": {d.isoformat(): int(n) for d, n in daily.items()},
            "dailyAc": {d.isoformat(): int(n) for d, n in daily_ac.items()}, "current": cur, "longest": lng,
            "currentSolve": cur_s, "longestSolve": lng_s, "activeDays": len(all_days)}


def forecast(hist, n=6):
    """Rolling-window weighted linear trend with damping. Rough estimate by design."""
    if len(hist) < 5:
        return None
    y = np.array([h["newRating"] for h in hist[-30:]], float)
    x = np.arange(len(y), dtype=float)
    w = 0.88 ** (len(y) - 1 - x)  # recent contests weigh more
    slope, icpt = np.polyfit(x, y, 1, w=np.sqrt(w))
    resid = y - (slope * x + icpt)
    sigma = max(float(np.sqrt(np.average(resid ** 2, weights=w))), 25.0)
    base = 0.5 * (y[-1] + slope * x[-1] + icpt)
    t = [h["ratingUpdateTimeSeconds"] for h in hist[-11:]]
    gap = float(np.median(np.diff(t))) if len(t) > 1 else 7 * 86400
    gap = min(max(gap, 3 * 86400), 60 * 86400)  # contest-frequency adjustment, clamped
    phi, acc, pts = 0.8, 0.0, []
    for h in range(1, n + 1):
        acc += phi ** h  # damped trend: gains shrink the further out we look
        mid = base + slope * acc
        band = 1.28 * sigma * math.sqrt(1 + 0.35 * h)  # ~80% band
        pts.append({"t": int(hist[-1]["ratingUpdateTimeSeconds"] + gap * h), "rating": round(mid),
                    "lo": round(mid - band), "hi": round(mid + band), "step": h})
    return {"points": pts, "slopePerContest": round(float(slope), 1), "sigma": round(sigma)}


def phases(hist, win=5):
    if len(hist) < win + 2:
        return []
    y = np.array([h["newRating"] for h in hist], float)
    def label(a, b):  # y[a..b] inclusive
        s = (y[b] - y[a]) / max(b - a, 1)
        return ("rapid improvement" if s >= 20 else "decline" if s <= -20
                else "plateau" if abs(s) < 6 and y[a:b + 1].std() < 45 else "steady")

    segs = []
    for i in range(win, len(y)):
        lab = label(i - win, i)
        if segs and (segs[-1]["label"] == lab or i - segs[-1]["start"] < 4):  # blips < 4 contests join the phase before
            segs[-1]["end"] = i
        else:
            segs.append({"label": lab, "start": i, "end": i})
    merged = []  # relabel by each segment's own net slope, then fuse neighbours that now agree
    for s in segs:
        s["label"] = label(s["start"] - 1, s["end"])
        if merged and merged[-1]["label"] == s["label"]:
            merged[-1]["end"] = s["end"]
        else:
            merged.append(s)
    out = []
    for s in merged:
        a, b = hist[s["start"] - 1], hist[s["end"]]
        out.append({"label": s["label"], "from": a["ratingUpdateTimeSeconds"], "to": b["ratingUpdateTimeSeconds"],
                    "fromIdx": s["start"], "toIdx": s["end"] + 1,
                    "contests": s["end"] - s["start"] + 1, "ratingFrom": a["newRating"], "ratingTo": b["newRating"]})
    return out


def patterns(df, tz_min):
    if df.empty:
        return {"byHour": [], "byWeekday": [], "bursts": []}
    local = pd.to_datetime(df["t"] + tz_min * 60, unit="s")
    d = pd.DataFrame({"h": local.dt.hour, "w": local.dt.dayofweek, "ok": df["ok"], "day": local.dt.date})
    hour = d.groupby("h").agg(subs=("ok", "size"), ac=("ok", "sum")).reindex(range(24), fill_value=0)
    wd = d.groupby("w").agg(subs=("ok", "size"), ac=("ok", "sum")).reindex(range(7), fill_value=0)
    per_day = d.groupby("day").size()
    thr = per_day.mean() + 3 * per_day.std() if len(per_day) > 10 else float("inf")
    bursts = per_day[(per_day > thr) & (per_day >= 15)].sort_values(ascending=False).head(8)

    def rows(tbl, name):
        return [{name: int(i), "subs": int(r.subs), "ac": int(r.ac),
                 "acRate": round(r.ac / r.subs, 3) if r.subs else 0} for i, r in tbl.iterrows()]

    by_hour = rows(hour, "hour")
    good = [r for r in by_hour if r["subs"] >= 10]
    return {"byHour": by_hour, "byWeekday": rows(wd, "weekday"),
            "peakHour": max(by_hour, key=lambda r: r["subs"])["hour"],
            "bestHour": max(good, key=lambda r: r["acRate"])["hour"] if good else None,
            "bursts": [{"day": k.isoformat(), "subs": int(v)} for k, v in bursts.items()]}


def milestones(hist, contests, ac_days_longest):
    crossings = []
    for th, name in TIERS:
        for i, h in enumerate(hist):
            if h["newRating"] >= th:
                crossings.append({"rating": th, "title": name, "contest": h["contestName"],
                                  "t": h["ratingUpdateTimeSeconds"], "contestNumber": i + 1})
                break
    attendance = None
    if hist:
        start = {c["id"]: c.get("startTimeSeconds", 0) for c in contests}
        first = start.get(hist[0]["contestId"], hist[0]["ratingUpdateTimeSeconds"] - 86400)
        # ponytail: name heuristic for "rated rounds"; CF has no rated flag in contest.list
        # parallel Div.1/Div.2 rounds share a start time: count them once
        held = {c.get("startTimeSeconds") for c in contests if c["phase"] == "FINISHED" and c.get("startTimeSeconds", 0) >= first
                and any(s in c["name"] for s in ("Div.", "Global", "Educational", "Rated"))}
        if held:
            attendance = {"attended": len(hist), "held": len(held), "rate": round(min(1, len(hist) / len(held)), 3)}
    return {"crossings": crossings, "attendance": attendance, "longestSolveStreak": ac_days_longest}


def recommend(ps, solved, attempted, rating, weak, limit=30):
    base = rating if rating else 1000
    lo, hi = max(base - 100, 800), max(base + 300, 1100)  # 800 is CF's lowest problem rating
    weight = {t: 1 - i * 0.15 for i, t in enumerate(weak[:5])}
    count = {pkey(s): s["solvedCount"] for s in ps["problemStatistics"]}
    out = []
    for p in ps["problems"]:
        r, key = p.get("rating"), pkey(p)
        if not r or not lo <= r <= hi or key in solved or "*special" in p.get("tags", []):
            continue
        hits = [t for t in p.get("tags", []) if t in weight]
        score = (2 * sum(weight[t] for t in hits) + (1 - abs(r - base - 100) / 400)
                 + 0.3 * math.log1p(count.get(key, 0)) / 12 + (0.4 if key in attempted else 0))
        out.append({"key": key, "contestId": p.get("contestId"), "index": p["index"], "name": p["name"],
                    "rating": r, "tags": p.get("tags", []), "weakTags": hits, "solvedCount": count.get(key, 0),
                    "upsolve": key in attempted, "score": round(score, 3)})
    out.sort(key=lambda o: -o["score"])
    return {"target": [lo, hi], "problems": out[:limit]}


# ---------- Codeforces rating formula (Mike Mirzayanov's open algorithm, as reimplemented by Carrot) ----------

def _seed_fn(ratings):
    vals, cnt = np.unique(np.asarray(ratings, float), return_counts=True)

    def seed(x):  # 1 + sum over everyone of P(they beat a player rated x)
        x = np.asarray(x, float)
        out = np.empty(len(x))
        for i in range(0, len(x), 512):
            out[i:i + 512] = 1 + (cnt / (1 + 10 ** ((x[i:i + 512, None] - vals) / 400))).sum(1)
        return out
    return seed, vals


def _rating_for_rank(G, rank):
    """Largest R in [1, 7999] with seed(R) >= rank (G = seed over that grid, decreasing)."""
    return np.maximum(np.searchsorted(-G, -np.asarray(rank, float), side="right"), 1)


def cf_deltas(ratings, ranks):
    r = np.asarray(ratings, float)
    rk = np.asarray(ranks, float)
    n = len(r)
    seed, vals = _seed_fn(r)
    G = seed(np.arange(1, 8000))
    own = (seed(vals) - 0.5)[np.searchsorted(vals, r)]  # exclude self (P = 0.5 vs itself)
    need = _rating_for_rank(G, np.sqrt(rk * own))
    d = np.trunc((need - r) / 2)
    d += np.trunc(-d.sum() / n) - 1
    z = min(n, 4 * round(math.sqrt(n)))
    top = np.argsort(-r, kind="stable")[:z]
    d += min(max(np.trunc(-d[top].sum() / z), -10), 0)
    return d.astype(int)


def tie_ranks(ranks):
    """CF gives every member of a tie the LAST position of the group."""
    ranks = np.asarray(ranks)
    vals, cnt = np.unique(ranks, return_counts=True)
    return (vals + cnt - 1)[np.searchsorted(vals, ranks)]


def estimate_delta(field, handle, old_display, k, rank):
    """field: [(handle, displayedOldRating, standingsRank)]. Returns predicted change if `handle` finished at `rank`."""
    others = [(r if r > 0 else 1400, rk) for h, r, rk in field if h.lower() != handle.lower()]
    rank = int(min(max(rank, 1), len(others) + 1))
    ratings = [r for r, _ in others]
    ranks = tie_ranks([rk if rk < rank else rk + 1 for _, rk in others]) if others else np.array([], int)
    internal = old_display + (PENALTY[k] if k < 6 else 0)
    d = cf_deltas(ratings + [internal], list(ranks) + [rank])[-1]
    new = internal + int(d) - (PENALTY[k + 1] if k + 1 < 6 else 0)
    seed, _ = _seed_fn(ratings or [internal])
    perf = int(_rating_for_rank(seed(np.arange(1, 8000)), rank))
    expected = float(seed(np.array([internal]))[0]) if ratings else 1.0
    return {"oldRating": old_display, "newRating": new, "delta": new - old_display, "rank": rank,
            "seed": round(expected),
            "fieldSize": len(others) + 1, "performance": perf, "newcomerAdjusted": k < 6}


# ---------- assembly ----------

def build_profile(info, hist, subs, contests, tz_min=0, now=None):
    now = now or datetime.now(timezone.utc).timestamp()
    df = frame(subs)
    p = problems(df)
    tags, overall = tag_table(p)
    solved = p[p["solved"].astype(bool)] if len(p) else p
    act = activity(df, tz_min, now)
    by_rating = solved["rating"].fillna(0).astype(int).value_counts().sort_index() if len(solved) else pd.Series(dtype=int)
    history = [{**h, "delta": h["newRating"] - h["oldRating"]} for h in hist]
    return {
        "info": info,
        "history": history,
        "solved": {
            "total": int(len(solved)), "attempted": int(len(p)), "submissions": int(len(df)),
            "byRating": [{"rating": int(r) or "unrated", "count": int(c)} for r, c in by_rating.items()],
            "verdicts": [{"verdict": v, "count": int(c)} for v, c in df["verdict"].value_counts().items()],
            "languages": [{"lang": v, "count": int(c)} for v, c in df["lang"].value_counts().head(8).items()],
        },
        "tags": tags,
        "weakTopics": weak_topics(tags, overall),
        "clusters": cluster_tags(tags),
        "activity": act,
        "forecast": forecast(hist),
        "phases": phases(hist),
        "patterns": patterns(df, tz_min),
        "milestones": milestones(hist, contests, act["longestSolve"]),
        "recent": [sub_row(s) for s in subs[:25]],
    }


def sub_row(s):
    return {"id": s["id"], "contestId": s.get("contestId"), "index": s["problem"]["index"],
            "name": s["problem"].get("name", ""), "rating": s["problem"].get("rating"),
            "verdict": s.get("verdict", "TESTING"), "lang": s.get("programmingLanguage", ""),
            "t": s["creationTimeSeconds"], "passed": s.get("passedTestCount", 0)}


def day_submissions(subs, day, tz_min):
    """Submissions whose local (tz-shifted) date is `day` (YYYY-MM-DD), oldest first."""
    return [sub_row(s) for s in reversed(subs)
            if datetime.fromtimestamp(s["creationTimeSeconds"] + tz_min * 60, timezone.utc).date().isoformat() == day]
