"""Run: python test_platforms.py   (offline; payloads mirror each source's real response shape)"""
import json

import platforms as P

NOW = 1_760_000_000  # 2025-10-09
DAY = 86400


def test_cf():
    info = {"handle": "Me", "rating": 1650, "maxRating": 1700, "rank": "expert", "titlePhoto": "x.png"}
    hist = [{"contestName": "R1", "rank": 10, "ratingUpdateTimeSeconds": NOW - 9 * DAY, "oldRating": 0, "newRating": 1400},
            {"contestName": "R2", "rank": 5, "ratingUpdateTimeSeconds": NOW - 2 * DAY, "oldRating": 1400, "newRating": 1650}]
    pr = lambda i, r, tags: {"contestId": 1, "index": i, "name": i, "rating": r, "tags": tags}
    subs = [{"creationTimeSeconds": NOW - DAY, "verdict": "WRONG_ANSWER", "problem": pr("A", 800, ["math"])},
            {"creationTimeSeconds": NOW - DAY + 5, "verdict": "OK", "problem": pr("A", 800, ["math"])},
            {"creationTimeSeconds": NOW - DAY + 9, "verdict": "OK", "problem": pr("A", 800, ["math"])},
            {"creationTimeSeconds": NOW, "verdict": "OK", "problem": pr("B", 2100, ["dp", "math"])},
            {"creationTimeSeconds": NOW, "verdict": "OK", "problem": pr("C", None, [])}]
    p = P.parse_cf(info, hist, subs, 0, NOW)
    assert p["solved"] == 3 and p["attempted"] == 3
    assert p["contests"][1]["delta"] == 250
    assert {d["label"]: d["count"] for d in p["difficulty"]} == {"<1200": 1, "1200-1599": 0, "1600-1999": 0, "2000-2399": 1, "2400+": 0, "unrated": 1}
    assert p["tags"][0] == {"tag": "math", "solved": 2}
    assert sum(p["daily"].values()) == 5 and p["recent"][0]["title"].startswith("1C")


def test_lc():
    cal = json.dumps({str(NOW - DAY): 3, str(NOW): 2, str(NOW - 400 * DAY): 9})
    data = {"matchedUser": {"username": "lcuser", "profile": {"userAvatar": "a.png"},
                            "submitStatsGlobal": {"acSubmissionNum": [{"difficulty": "All", "count": 60}, {"difficulty": "Easy", "count": 30},
                                                                      {"difficulty": "Medium", "count": 25}, {"difficulty": "Hard", "count": 5}]},
                            "tagProblemCounts": {"advanced": [{"tagName": "Dynamic Programming", "problemsSolved": 12}],
                                                 "intermediate": [{"tagName": "Hash Table", "problemsSolved": 20}],
                                                 "fundamental": [{"tagName": "Array", "problemsSolved": 40}, {"tagName": "Enumeration", "problemsSolved": 0}]},
                            "userCalendar": {"submissionCalendar": cal}},
            "userContestRanking": {"rating": 1901.4, "topPercentage": 5.1, "globalRanking": 1234, "badge": {"name": "Knight"}},
            "userContestRankingHistory": [{"attended": False, "rating": 1500, "contest": {"title": "W0", "startTime": NOW - 30 * DAY}},
                                          {"attended": True, "rating": 1550.2, "ranking": 900, "contest": {"title": "W1", "startTime": NOW - 20 * DAY}},
                                          {"attended": True, "rating": 1901.4, "ranking": 90, "contest": {"title": "W2", "startTime": NOW - 10 * DAY}}],
            "recentAcSubmissionList": [{"title": "Two Sum", "titleSlug": "two-sum", "timestamp": str(NOW)}]}
    p = P.parse_lc(data, 0, NOW)
    assert p["solved"] == 60 and [d["count"] for d in p["difficulty"]] == [30, 25, 5]
    assert p["rating"] == 1901 and p["maxRating"] == 1901 and p["title"] == "Knight"
    assert [c["delta"] for c in p["contests"]] == [None, 351]
    assert sum(p["daily"].values()) == 5  # the 400-day-old entry is outside the window
    assert p["tags"][0]["tag"] == "Array" and all(t["solved"] for t in p["tags"])
    assert p["recent"][0]["url"] == "https://leetcode.com/problems/two-sum/"
    try:
        P.parse_lc({"matchedUser": None})
        raise AssertionError("expected 404")
    except P.SourceError as e:
        assert e.status == 404


def test_ac():
    hist = [{"IsRated": True, "Place": 900, "OldRating": 0, "NewRating": 300, "Performance": 800, "ContestName": "ABC 1",
             "EndTime": "2025-09-01T22:40:00+09:00"},
            {"IsRated": False, "Place": 1, "OldRating": 300, "NewRating": 300, "ContestName": "ARC unrated", "EndTime": "2025-09-05T22:40:00+09:00"},
            {"IsRated": True, "Place": 400, "OldRating": 300, "NewRating": 850, "Performance": 1300, "ContestName": "ABC 2",
             "EndTime": "2025-09-08T22:40:00+09:00"}]
    s = lambda pid, res, t: {"problem_id": pid, "contest_id": pid.split("_")[0], "result": res, "epoch_second": t}
    subs = [s("abc1_a", "WA", NOW - 5), s("abc1_a", "AC", NOW - 4), s("abc1_a", "AC", NOW - 3), s("abc2_f", "AC", NOW), s("abc2_g", "TLE", NOW)]
    models = {"abc1_a": {"difficulty": -500}, "abc2_f": {"difficulty": 1700}}
    p = P.parse_ac("me", hist, subs, models, 0, NOW)
    assert p["rating"] == 850 and p["maxRating"] == 850 and p["title"] == "green" and len(p["contests"]) == 2
    assert p["solved"] == 2 and p["attempted"] == 3
    counts = {d["label"]: d["count"] for d in p["difficulty"]}
    assert counts["gray"] == 1 and counts["blue"] == 1
    assert P.ac_diff({"difficulty": -500}) > 0


def test_cc():
    page = """<html><title>me | CodeChef</title><div class="user-details-container"><h1 class="h2-style">Me Name</h1></div>
    <div class="rating-number">1687?</div><small>(Highest Rating 1720)</small>
    <h3>Total Problems Solved: 142</h3>
    <script>var all_rating = [{"code":"START1","getyear":"2025","getmonth":"8","getday":"1","rating":"1500","rank":"2000","name":"Starters 1","end_date":"2025-08-01 22:00:00"},
    {"code":"START2","getyear":"2025","getmonth":"9","getday":"1","rating":"1687","rank":"800","name":"Starters 2","end_date":"2025-09-01 22:00:00"}];
    var userDailySubmissionsStats = [{"date":"2025-10-8","value":4},{"date":"2025-10-9","value":1}];</script></html>"""
    p = P.parse_cc("me", page, 0, NOW)
    assert p["rating"] == 1687 and p["maxRating"] == 1720 and p["title"] == "3★" and p["solved"] == 142
    assert [c["delta"] for c in p["contests"]] == [None, 187]
    assert p["daily"] == {"2025-10-08": 4, "2025-10-09": 1}
    try:
        P.parse_cc("nobody", "<html><title>Page not found</title></html>")
        raise AssertionError("expected 404")
    except P.SourceError as e:
        assert e.status == 404


def test_upcoming_parsers():
    assert P.parse_cf_upcoming([{"id": 5, "name": "R", "phase": "BEFORE", "startTimeSeconds": 10, "durationSeconds": 7200},
                                {"id": 4, "name": "old", "phase": "FINISHED", "startTimeSeconds": 1, "durationSeconds": 1}])[0]["url"].endswith("/5")
    assert P.parse_lc_upcoming({"topTwoContests": [{"title": "Weekly 1", "titleSlug": "weekly-1", "startTime": 10, "duration": 5400}]})[0]["duration"] == 5400
    cc = P.parse_cc_upcoming({"future_contests": [{"contest_code": "START9", "contest_name": "Starters 9",
                                                   "contest_start_date_iso": "2025-10-15T20:00:00+05:30", "contest_duration": "120"}]})
    assert cc[0]["duration"] == 7200 and cc[0]["start"] == 1760538600
    page = """<div id="contest-table-upcoming"><table><tbody>
      <tr><td class="text-center"><a href="x"><time class="fixtime fixtime-full">2025-10-11 21:00:00+0900</time></a></td>
      <td><span>Ⓐ</span> <a href="/contests/abc426">AtCoder Beginner Contest 426</a></td>
      <td class="text-center">01:40</td><td class="text-center"> - 1999</td></tr></tbody></table></div>"""
    ac = P.parse_ac_upcoming(page)
    assert ac == [{"platform": "ac", "name": "AtCoder Beginner Contest 426", "start": 1760184000, "duration": 6000,
                   "url": "https://atcoder.jp/contests/abc426"}], ac


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
