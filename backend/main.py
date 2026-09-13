import json
import re

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import analytics as A
from cf import CFError, cf, user_status


class NumpyJSON(JSONResponse):
    def render(self, content):
        return json.dumps(content, default=lambda o: o.item() if hasattr(o, "item") else str(o)).encode()


app = FastAPI(title="Codeforces Visualizer API", default_response_class=NumpyJSON)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://[a-z]+|http://(localhost|127\.0\.0\.1)(:\d+)?)$",
    allow_methods=["GET"],
    allow_headers=["*"],
)
HANDLE = re.compile(r"^[A-Za-z0-9_.\-]{2,24}$")


@app.exception_handler(CFError)
async def cf_error(_, e: CFError):
    return JSONResponse({"detail": str(e)}, status_code=e.status)


def check(handle):
    if not HANDLE.match(handle):
        raise HTTPException(400, "Handles are 2-24 characters: letters, digits, _ - .")


async def info_and_history(handle):
    info = (await cf("user.info", 600, handles=handle))[0]
    return info, await cf("user.rating", 1800, handle=handle)


@app.get("/api/profile/{handle}")
async def profile(handle: str, tz: int = Query(0, ge=-900, le=900)):
    check(handle)
    info, hist = await info_and_history(handle)  # user.info first: fails fast on unknown handles
    subs = await user_status(handle)
    contests = await cf("contest.list", 3600, gym="false")
    return A.build_profile(info, hist, subs, contests, tz)


@app.get("/api/day/{handle}")
async def day(handle: str, date: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"), tz: int = Query(0, ge=-900, le=900)):
    check(handle)
    return A.day_submissions(await user_status(handle), date, tz)


async def solved_and_weak(handle):
    info, _ = await info_and_history(handle)
    df = A.frame(await user_status(handle))
    p = A.problems(df)
    tags, overall = A.tag_table(p)
    solved = set(p.loc[p["solved"].astype(bool), "key"]) if len(p) else set()
    return info, solved, set(p["key"]) if len(p) else set(), A.weak_topics(tags, overall)


@app.get("/api/recommend/{handle}")
async def recommend(handle: str, limit: int = Query(30, ge=1, le=100)):
    check(handle)
    info, solved, attempted, weak = await solved_and_weak(handle)
    ps = await cf("problemset.problems", 6 * 3600)
    return A.recommend(ps, solved, attempted, info.get("rating"), weak["weak"], limit) | {"weak": weak["weak"]}


@app.get("/api/summary/{handle}")
async def summary(handle: str):
    """Compact payload for the Chrome extension."""
    check(handle)
    info, solved, attempted, weak = await solved_and_weak(handle)
    return {"handle": info["handle"], "rating": info.get("rating"), "rank": info.get("rank"),
            "maxRating": info.get("maxRating"), "avatar": info.get("titlePhoto"), "weak": weak["weak"],
            "relative": weak["relative"], "solved": sorted(solved), "attempted": sorted(attempted - solved),
            "weakDetail": [r for r in weak["ranked"] if r["tag"] in weak["weak"]]}


@app.get("/api/contests")
async def contests():
    cs = await cf("contest.list", 600, gym="false")
    return [c for c in cs if c["phase"] != "BEFORE"][:60]


@app.get("/api/estimate/{handle}")
async def estimate(handle: str, contestId: int, rank: int = Query(ge=1)):
    check(handle)
    _, hist = await info_and_history(handle)
    prior = [h for h in hist if h["contestId"] != contestId]  # re-estimating a past contest: use rating before it
    at = next((h for h in hist if h["contestId"] == contestId), None)
    old = at["oldRating"] if at else (prior[-1]["newRating"] if prior else 0)
    k = hist.index(at) if at else len(hist)
    try:
        changes = await cf("contest.ratingChanges", 86400, contestId=contestId)
    except CFError:
        changes = []
    if changes:
        field, source = [(c["handle"], c["oldRating"], c["rank"]) for c in changes], "final rated field"
    else:
        rows = (await cf("contest.standings", 60, contestId=contestId, showUnofficial="false"))["rows"]
        # ponytail: whole active rated list (~MBs, cached 1 day) to rate a live field; the per-handle alternative is 10k+ calls
        rated = {u["handle"]: u.get("rating", 0) for u in await cf("user.ratedList", 86400, activeOnly="true", includeRetired="false")}
        field = [(m["handle"], rated.get(m["handle"], 0), r["rank"])
                 for r in rows if r["party"]["participantType"] == "CONTESTANT" for m in r["party"]["members"]]
        source = "live standings"
    if not field:
        raise HTTPException(404, "No rated participants found for this contest yet")
    return A.estimate_delta(field, handle, old, k, rank) | {"source": source, "contestId": contestId,
                                                           "actual": at["newRating"] - at["oldRating"] if at else None,
                                                           "actualRank": at["rank"] if at else None}
