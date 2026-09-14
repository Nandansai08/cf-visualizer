"""Run: python test_analytics.py   (offline, no network)"""
from datetime import date

import numpy as np

import analytics as A


def sub(i, key, verdict, tags, rating=1200, t=1_700_000_000):
    c, idx = key.split("-")
    return {"id": i, "creationTimeSeconds": t, "verdict": verdict, "programmingLanguage": "C++",
            "problem": {"contestId": int(c), "index": idx, "name": key, "rating": rating, "tags": tags}}


def test_streaks():
    d = lambda n: date(2026, 1, n)
    assert A.streaks(set(), d(10)) == (0, 0)
    assert A.streaks({d(1), d(2), d(3), d(7), d(8)}, d(9)) == (2, 3)  # current may end yesterday
    assert A.streaks({d(1), d(2), d(3)}, d(9)) == (0, 3)


def test_ties():
    assert list(A.tie_ranks([1, 2, 2, 4])) == [1, 3, 3, 4]


def test_formula():
    rng = np.random.default_rng(0)
    r = rng.integers(800, 2800, 2000)
    d = A.cf_deltas(r, np.arange(1, 2001))
    assert d[0] > 0 and d[-1] < 0
    assert abs(d.mean()) < 3  # CF's adjustment keeps the round roughly zero-sum
    field = [(f"u{i}", int(x), i + 1) for i, x in enumerate(np.full(500, 1500))]
    top, bottom = A.estimate_delta(field, "me", 1500, 10, 1), A.estimate_delta(field, "me", 1500, 10, 500)
    assert top["delta"] > 50 > -50 > bottom["delta"], (top, bottom)
    assert top["performance"] > 1500 > bottom["performance"]
    # newcomer: displayed 0 after 0 contests, finishing mid-table should still land well above 0
    assert A.estimate_delta(field, "me", 0, 0, 250)["newRating"] > 300


def test_sparse_and_empty():
    empty = A.build_profile({"handle": "x"}, [], [], [], 0)
    assert empty["solved"]["total"] == 0 and empty["forecast"] is None and empty["clusters"] == []
    subs = [sub(1, "1-A", "OK", ["math"]), sub(2, "1-B", "WRONG_ANSWER", ["dp"]), sub(3, "1-B", "WRONG_ANSWER", ["dp"])]
    p = A.build_profile({"handle": "x"}, [], subs, [], 0)
    assert p["solved"]["total"] == 1 and p["solved"]["attempted"] == 2 and p["weakTopics"]["weak"] == []
    assert len(p["submissions"]) == 3
    assert A.build_profile({"handle": "x"}, [], subs, [], 0, include_subs=False)["submissions"] == []
    hist = [{"contestId": 1, "contestName": "R1", "rank": 5, "ratingUpdateTimeSeconds": 2_000, "oldRating": 0, "newRating": 400}]
    h = A.build_profile({"handle": "x"}, hist, subs, [{"id": 1, "startTimeSeconds": 1_000, "phase": "FINISHED", "name": "R1"}], 0)["history"][0]
    assert h["startTimeSeconds"] == 1_000 and h["delta"] == 400 and h["durationSeconds"] is None


def test_weak_and_clusters():
    subs, i = [], 0
    for tag, ok in [("dp", 0.2), ("math", 1), ("greedy", 0.9), ("graphs", 0.3), ("strings", 1), ("trees", 0.5), ("bitmasks", 0.95)]:
        for j in range(10):
            i += 1
            subs.append(sub(i, f"{i}-A", "OK" if j < ok * 10 else "WRONG_ANSWER", [tag], 1000 + 100 * j))
    hist = [{"contestId": c, "contestName": f"R{c}", "rank": 1, "ratingUpdateTimeSeconds": 1_600_000_000 + c * 604800,
             "oldRating": 1000 + 40 * c, "newRating": 1040 + 40 * c} for c in range(12)]
    p = A.build_profile({"handle": "x"}, hist, subs, [], 0)
    assert p["weakTopics"]["weak"][:2] == ["dp", "graphs"], p["weakTopics"]
    assert "dp" in next(c for c in p["clusters"] if c["label"] == "Weak")["tags"]
    assert p["forecast"]["points"][0]["rating"] > hist[-1]["newRating"] - 50
    assert p["milestones"]["crossings"][0]["rating"] == 1200
    assert p["phases"][0]["label"] == "rapid improvement"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
