# DECISIONS.md — Campus Marte

Product and spike decisions. Spec 2.13 is the source for the product list; T-1.5 is the CORS spike. Nest stream proxy is **not** implemented here.

---

## CORS / video proxy (T-1.5)

**Verdict:** `<video src="https://archive.org/...">` is **not CORS-safe** from `http://localhost`. Default **`VIDEO_PROXY=true`**.

All six spec 2.2.2 URLs redirect to `dn*.archive.org` CDNs. After follow, **none** send `Access-Control-Allow-Origin` (not `*`, not the probe Origin). A browser `<video crossorigin>` or `fetch()` of those bytes would fail CORS. Native `<video>` without `crossorigin` can still play (media element exemption) but RNF-03 (zero console errors), the range overlay (ADR-005), and RSK-01 forbid relying on that.

Range itself works: HEAD `200` + `Accept-Ranges: bytes`; GET `Range: bytes=0-1` → `206` + `Content-Range`. The later Nest `GET /api/videos/:id/stream` should forward `Range` and `Accept-Ranges`. **This task only documents the flag; it does not implement the proxy.**

`docker-compose.yml` sets `VIDEO_PROXY=true` on `api` so the player will point `<video src>` at `/api/videos/:id/stream` once that route exists.

### Probe

- When: 2026-09-16
- Origin: `http://localhost`
- Script: `api/scripts/probe-video-cors.ts` (`npm run probe:cors` from `api/`)
- Requests: HEAD; GET with `Range: bytes=0-1`; `redirect: follow`

| id | method | status | access-control-allow-origin | accept-ranges | content-range | content-type |
|---|---|---|---|---|---|---|
| playa | HEAD | 200 | *(none)* | bytes | *(none)* | video/mp4 |
| playa | GET | 206 | *(none)* | *(none)* | bytes 0-1/1030541 | video/mp4 |
| cascada | HEAD | 200 | *(none)* | bytes | *(none)* | video/mp4 |
| cascada | GET | 206 | *(none)* | *(none)* | bytes 0-1/719202 | video/mp4 |
| bosque | HEAD | 200 | *(none)* | bytes | *(none)* | video/mp4 |
| bosque | GET | 206 | *(none)* | *(none)* | bytes 0-1/1755549 | video/mp4 |
| atardecer | HEAD | 200 | *(none)* | bytes | *(none)* | video/mp4 |
| atardecer | GET | 206 | *(none)* | *(none)* | bytes 0-1/2767465 | video/mp4 |
| auroras | HEAD | 200 | *(none)* | bytes | *(none)* | video/mp4 |
| auroras | GET | 206 | *(none)* | *(none)* | bytes 0-1/2505088 | video/mp4 |
| largo | HEAD | 200 | *(none)* | bytes | *(none)* | video/mp4 |
| largo | GET | 206 | *(none)* | *(none)* | bytes 0-1/8333708 | video/mp4 |

Final hosts after redirect (HEAD / GET; archive.org may pick a different `dn*` node):

| id | final host (sample) |
|---|---|
| playa | `dn710708.ca.archive.org` |
| cascada | `dn600306.us.archive.org` |
| bosque | `dn711003.ca.archive.org` |
| atardecer | `dn710607.ca.archive.org` / `dn800204.us.archive.org` |
| auroras | `dn800303.us.archive.org` / `dn711005.ca.archive.org` |
| largo | `dn800300.us.archive.org` |

Durations are recorded in **Video durations (T-1.6)** below.

---

## Video durations (T-1.6)

**Verdict:** six `durationSeconds` committed in `api/prisma/seed.ts` as `VIDEO_DURATIONS`. Full Prisma inserts wait for T-3.2. Evaluator `docker compose up` must not re-probe archive.org for the 90 % rule.

**When:** 2026-09-16  
**ffprobe:** not installed on the probe host.  
**Method:** ISO BMFF `mvhd` from `GET Range: bytes=0-262143` (`api/scripts/probe-video-durations.ts`, `npm run probe:durations` from `api/`). All six files have `moov`/`mvhd` in the first 256 KiB (`timescale=1000`).  
**Integer rule:** `durationSeconds = Math.round(mvhd.duration / mvhd.timescale)`.  
**Fallback:** none — every spec 2.2.2 URL returned `mvhd`. No invented numbers.

| id | durationSeconds | mvhd seconds | timescale | duration ticks | Content-Length |
|---|---|---|---|---|---|
| playa | 10 | 9.924 | 1000 | 9924 | 1030541 |
| cascada | 11 | 10.978 | 1000 | 10978 | 719202 |
| bosque | 20 | 20.098 | 1000 | 20098 | 1755549 |
| atardecer | 27 | 26.744 | 1000 | 26744 | 2767465 |
| auroras | 28 | 28.434 | 1000 | 28434 | 2505088 |
| largo | 104 | 103.979 | 1000 | 103979 | 8333708 |

Note: spec 2.2.4 Carla `bosque` 0–25 is longer than the measured 20.098 s file. Seed still stores the probed duration; clipping of events past EOF is a later domain/import concern.

---

## Product decisions (spec 2.13)

Short form only; no extra product choices.

1. **State machine:** only the PDF forward edges (`draft → in_review → published → retired`, plus `in_review → draft` is **not** allowed). Illegal pairs → 409 `STATE_TRANSITION_FORBIDDEN`. No “return to draft” from published.
2. **Playback events** are keyed to **video + user**, not enrollment. Diego’s playa seconds and Bruno’s atardecer seconds persist; they surface in a course only after the user is enrolled in a published version that contains that `videoId`.
3. **`rate` is metadata.** The `[from, to)` interval is already video time; x2 does not stretch or shrink unique seconds.
4. **Import:** inverted interval (`from >= to`) and unknown video → `accepted=false` + `rejectReason`, counted, import continues. Progress unions only `accepted=true`.
5. **Course progress** = arithmetic mean of chapter `ratio` values on the version the student sees.
6. **Tab kill:** heartbeat / flush ≤ 5 s. Unflushed tail may be lost; resume cursor is last accepted `to`.
7. **UI / media:** Naive UI; own logo at `/logo.png`; video via API Range proxy when `VIDEO_PROXY=true` (this spike).
8. **Delivery repo:** private `joaldico/marte-campus` until handoff.
