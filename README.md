# CF Visualizer

Codeforces profile analytics: FastAPI proxy/cache + React dashboard + Chrome extension.

## Run

```bash
pip install -r backend/requirements.txt
cd backend && python -m uvicorn main:app --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 (Vite proxies `/api` to :8000).

Backend self-check (offline): `cd backend && python test_analytics.py`

## Chrome extension

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → pick `extension/`.
2. Click the toolbar icon → Settings → enter your handle (backend/dashboard URLs default to localhost).

Badges appear on `codeforces.com/problemset/problem/*` and `codeforces.com/contest/*/problem/*`;
profile pages get an **Open in Visualizer** button. Summaries are cached in `chrome.storage` for 30 min.

## API

| Endpoint | What |
| --- | --- |
| `GET /api/profile/{handle}?tz=<minutes>` | info, rating history, solved/tag/verdict stats, weak topics, clusters, heatmap, forecast, phases, patterns, milestones, recent submissions |
| `GET /api/recommend/{handle}` | unsolved problems near your rating, weighted to weak tags |
| `GET /api/estimate/{handle}?contestId=&rank=` | CF rating formula over the contest's real field (final rating changes, or live standings + rated list) |
| `GET /api/summary/{handle}` | compact payload for the extension |
| `GET /api/contests` | recent/running contests |

## Notes

- All Codeforces calls go through one SQLite cache (`backend/cache.db`) and a global lock spacing requests 2.1 s apart. Cold load of a large profile is ~10 s; cached loads are instant.
- Estimator matches real deltas within ~10 points on tested rounds. Other newcomers in the field are treated as internal 1400.
- Forecast is a damped, recency-weighted linear trend: a rough estimate, labelled as such.
- Attendance rate is approximate (name heuristic for rated rounds; parallel Div. 1/2 rounds counted once).
