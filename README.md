# Meal Planner — Lavagna Cibo

Interactive shared calendar per *house* (family, flatmates, etc.). Each day is split into meals (default `lunch`/`dinner`, fully editable via daily template), any member can propose plates per meal, vote them, drag & drop between zones. Past days are read-only. Single Docker image, no build chain.

---

## Quick start

```bash
docker compose up --build
# open http://localhost:8000
# health: curl http://localhost:8000/api/health -> {"ok":true}
```

Compose: single service `app:8000` (`python:3.12-slim` + FastAPI + static frontend), named volume `db_data:/data` holding `sqlite:////data/app.db`.

Env:

```env
DATABASE_URL=sqlite:////data/app.db
SECRET_KEY=change-me-please-use-long-random-string  # JWT HMAC, 32+ chars
```

`.env` is ignored (see `.env.example`). No `.db`/`__pycache__` committed.

---

## Features

### Auth & houses
- `username` globally unique, `password` bcrypt, JWT Bearer (`48h`, `PyJWT`).
- User can belong to **multiple houses**, switch via header select or Settings → User.
- Create house (auto-member) or join by `invite_code` (upper `hex`) or by exact house name fallback. House name unique. Invite shown in header + Settings → House → Copy.

### Calendar
- **Views:** weekly (default, Mon-Sun, `mondayOf()`), monthly (grid 35 cells, click opens day modal), daily (single day). Prev/Next/Today.
- **Slots:** per-day. Seeded from house `daily_template` (JSON array, default `["lunch","dinner"]`). Any member can add custom slot per date (`POST /api/slots`), any can delete (plates in slot move to day buffer). Past days locked (no create/delete).
- **Past lock:** `is_past(date)` = `date < today_iso()` UTC. Server rejects `400 past days not modifiable` for `POST/DELETE /api/slots`, `POST/PUT/DELETE /api/plates`, `POST /api/plates/{id}/move` (source or target past), `POST /api/plates/{id}/vote`. Frontend `isPast()` hides adds, disables drops, marks `.past` grey, shows `locked` label.

### Plates
- Per slot **many proposals**. Each plate: `title` (required), `note` (optional), `tags` (comma-separated, lower, max 8, e.g. `fish, meat, first, dessert, vegetarian`), `proposed_by`, `created_at`.
- **Only creator** can edit/delete (`PUT/DELETE /api/plates/{id}` → `403` else). Title/note/tags editable via prompt (tags comma).
- **Tags** case-insensitive, stored lower `fish,meat`, shown as chips `.tag`. Autocomplete for tags via `GET /api/tags/autocomplete?house_id&q` (prefix, sorted by frequency then name).
- **History:** `GET /api/plates/history?house_id&sort=name|recent|count&q&tag&limit=100` — distinct titles **case-insensitive** (`GROUP BY lower(title)`, `MIN(title)` keeper), aggregates `count/last/tags`. Shown in card beside global buffer (`#buffer-history-row` grid `1fr 1fr`, stack `<900px`), default **expanded** (`#history-list` `display:block`), sortable by name (A-Z case-insensitive), recent, count; filters `q`/`tag`; drag & drop **duplicates** (creates new plate, history entry stays).

### Voting
- Per plate one vote per user: `value 1` up, `-1` down, `0` remove. `POST /api/plates/{id}/vote {value}` toggles. Stored `votes(plate_id,user_id,value)`. Returned `up/down/score/my_vote`, plates sorted by `score desc` per slot.

### Drag & drop
- Native HTML5 `draggable` + `dragover/drop` (no lib). Slots and buffer are drop zones, plates draggable (except past). Moving any member allowed (`POST /api/plates/{id}/move {to_date,to_slot_id}`) — `null` → global buffer, `date` without slot → day buffer. History drag **duplicates** (`POST /api/plates` with same `title/tags`), not move, so history never loses entries.

### Buffer
- **Global** (`date=null`, shared across all days) vs **per-day** (`date=set, slot=null`) toggle per house `PUT /api/houses/{id}/buffer {mode}`. Header checkbox + Settings → House sync. Global shown at bottom (always), per-day shows inside each day column + modal buffer when `per_day`.

### Daily template
- House `daily_template` JSON `TEXT` default `["lunch","dinner"]` (`models.py:13`).
- Seeded via `ensure_slots()` per date if no slots.
- Settings → Template: list inputs add/remove/↑↓, `Save template` `PUT /api/houses/{id}/template {labels}` (1-8 unique, case-insensitive dedup), checkbox `apply to existing future dates` → `?apply_future=true` makes all `date >= today` slots exactly match new template (adds missing in order, deletes extra moving plates to buffer).

### Case-insensitive
- Plates title distinct/ac/history grouped by `lower(title)` (`MIN(title)` keeper). `q` filters use `lower`. Autocomplete already `lower(title) LIKE pattern`. So `Pasta`/`pasta`/`PASTA` count as one.

### History + buffer layout
- `#buffer-history-row` grid side-by-side, not stacked. Buffer left, history right, both `margin:0` inside row, responsive single column `<900px`.

### Settings & theme
- Header `⚙ Settings` opens `#settings-modal` (fixed overlay same as day modal `style.css:85` `#day-modal,#settings-modal`). Tabs:
  - **User:** shows `username`, change username (`PUT /api/me {username}`), change password (`password` + `new_password`), house list with `Switch` active marker.
  - **House:** rename (`PUT /api/houses/{id} {name}`), invite code copy, members list (`GET /api/houses/{id}`), buffer toggle.
  - **Template:** editor as above.
  - **Theme:** CSS vars `:root` (`--bg/--fg/--card/--header`) + `body.theme-dark/warm` (`style.css:1`), `select` + `color` accent picker stored `localStorage lavagna_theme/accent` via `app.js:58` `applyTheme()`.
- User can select active house via header select or Settings → User.

### Autocomplete
- Titles `GET /api/plates/autocomplete?house_id&query&limit=8` prefix `lower(title) LIKE q%`, grouped case-insensitive, ordered by count then `max(created_at)`, debounced 200ms.
- Tags `GET /api/tags/autocomplete?house_id&query` prefix, frequency sorted, comma-fragment aware (`fish, me` → `me`).

---

## Architecture (ponytail lite)

- **Backend:** `FastAPI` + `SQLAlchemy` + `SQLite` file `/data/app.db` via volume, `passlib[bcrypt]`, `PyJWT`, `python-multipart`. No Postgres, no WebSocket.
- **Frontend:** vanilla `HTML/CSS/JS` + native drag-drop + `fetch`, no npm build. Served as `StaticFiles` at `/` from FastAPI (`main.py:656` fallback SPA).
- **Docker:** `backend/Dockerfile` `FROM python:3.12-slim` copies `backend/*.py` + `frontend/` to `/app`, `docker-compose.yml` single `app:8000` + `db_data`.

Ponytail notes: single SQLite file (switch to Postgres if multi-instance), distinct scan for autocomplete/history (FTS if >10k), native DnD (add `SortableJS` for touch), tags as comma string (separate table if filtering at scale), theme `localStorage` only.

---

## Data model

```
users(id PK, username UNIQUE, password_hash)
houses(id PK, name UNIQUE, invite_code UNIQUE, buffer_mode ENUM global/per_day, daily_template TEXT JSON '["lunch","dinner"]', created_by FK)
memberships(user_id, house_id PK composite)
slots(id PK, house_id FK, date TEXT YYYY-MM-DD, label TEXT, sort_order INT, UNIQUE house_id/date/label)
plates(id PK, house_id FK, title TEXT, note TEXT, tags TEXT comma, date TEXT NULL, slot_id FK NULL, proposed_by FK, created_at DATETIME)
  slot_id NULL & date NULL → global buffer; slot_id NULL & date SET → day buffer
votes(plate_id FK, user_id FK, value INT 1/-1 PK composite)
```

Migrations: `ensure_migrations()` `PRAGMA table_info` + `ALTER TABLE` for `daily_template`/`tags`, backfill.

---

## API (all `Authorization: Bearer <token>` except auth)

```
POST   /api/auth/register {username,password} -> {token,user}
POST   /api/auth/login {username,password} -> {token,user}
GET    /api/me -> {id,username}
PUT    /api/me {username?,password?,new_password?} -> {id,username,token}
GET    /api/houses -> [{id,name,invite_code,buffer_mode,daily_template,created_by}]
POST   /api/houses {name} -> {id,name,invite_code,buffer_mode,daily_template}
POST   /api/houses/join {invite_code} -> {id,name,...}
GET    /api/houses/{id} -> {id,name,invite_code,buffer_mode,daily_template,created_by,members:[{id,username}]}
PUT    /api/houses/{id} {name?} -> {id,...}
PUT    /api/houses/{id}/buffer {mode:global|per_day}
PUT    /api/houses/{id}/template {labels:string[]} ?apply_future=bool -> {id,daily_template}
GET    /api/calendar?house_id&from=YYYY-MM-DD&to=YYYY-MM-DD -> {house:{id,name,buffer_mode,daily_template}, days:[{date,slots:[{id,label,sort_order,plates:[{id,title,note,tags,tags_str,date,slot_id,proposed_by,score,up,down,my_vote}]}],day_buffer:[]}], global_buffer:[]}
POST   /api/slots {house_id,date,label} -> {id,label,date,sort_order} 400 past
DELETE /api/slots/{id} -> {ok} 400 past (plates → buffer)
POST   /api/plates {house_id,date?,slot_id?,title,note?,tags?} -> plate 400 past
PUT    /api/plates/{id} {title?,note?,tags?} creator-only, 400 past
POST   /api/plates/{id}/move {to_date?,to_slot_id?} any-member, 400 if source/target past
DELETE /api/plates/{id} creator-only, 400 past
POST   /api/plates/{id}/vote {value:1|-1|0} 400 past -> {plate_id,score,up,down,my_vote}
GET    /api/plates/autocomplete?house_id&query&q&limit=8 -> [titles] case-insensitive prefix, GROUP BY lower
GET    /api/tags/autocomplete?house_id&query&limit=8 -> [tags] prefix, frequency sorted
GET    /api/plates/history?house_id&sort=name|recent|count&q&tag&limit=100 -> [{title,count,last_used,tags,example_note}] case-insensitive distinct, sorted
GET    /api/health -> {ok:true}
GET    / -> index.html (SPA fallback)
```

Frontend file refs: `backend/main.py:1`, `models.py:1`, `auth.py:1`, `db.py:1`, `frontend/index.html:1`, `app.js:1`, `style.css:1`, `docker-compose.yml:1`.

---

## Frontend flow

`/ → auth (login/register tabs, unselected #f5f5f5/#555 `style.css:7`) → houses (create/join, list) → app`

App header: house select + invite + buffer toggle + view switch weekly/monthly/daily + prev/next/today + Settings ⚙

- **Weekly:** 7 columns Mon-Sun, each day header clickable → day modal, slots stacked, per-day buffer inside if `per_day`, add-plate per slot + per day buffer.
- **Monthly:** 5-week grid, header Mon-Sun, cells show mini `label:count|buffer:n`, click → day modal.
- **Daily:** single day detail.
- **Day modal:** 2-col slots, bottom day buffer, add-slot, paste lock via `isPast()`.
- **Buffer/history row:** `#buffer-history-row` grid side-by-side → global buffer left (drag here, add plate + tags), history right (search/tag filter, sort, drag duplicate).
- **Plate card:** title + note + tags chips + vote ▲/▼ + score + edit/delete if creator + past lock.
- **History item:** title + count + tags + note, buttons `Add to buffer`/`Add to today`, **draggable** duplicate (ghost, on drop creates new plate with same title/tags).
- **Settings modal:** fixed overlay centered (like day modal) with User/House/Template/Theme tabs.

Drag: native `draggable`, `dragover/drop` → `POST /move` (plates) or `POST /api/plates` duplicate (history). Past `draggable=false`.

---

## Theme

`localStorage lavagna_theme` `light|dark|warm`, `lavagna_accent`. Applied on load via `app.js:58` `applyTheme()` setting `body.theme-*` and `--accent`.

---

## Past lock & case-insensitive

- Past = `date < today_iso()` UTC. Server `400` + frontend `.past` grey + `locked` label + hide adds/drops.
- Case-insensitive group `lower(title)` for history/autocomplete, `q` lower filter, `sort=name` via `lower`.

---

## Development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
DATABASE_URL=sqlite:///./app.db uvicorn main:app --app-dir backend --reload
# frontend served at http://127.0.0.1:8000/
```

Tests: `TestClient` covers register/login/multi-house, calendar seed, past guards, votes, move, tags/history/template/rename/me, case-insensitive, autocomplete; docker `curl`.

---

## Docker

```bash
docker compose build
docker compose up -d
docker compose logs -f
docker compose down -v # wipe volume
```

---

## Git

`*.md` ignored except `README.md` (this file). Sensitive `.env`/`*.db`/`__pycache__`/`/data` ignored per `.gitignore:1`.

