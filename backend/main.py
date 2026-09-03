from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import os, secrets, pathlib, datetime

from db import get_db, engine, Base
import models
import auth
from auth import get_current_user, require_membership
from pydantic import BaseModel
from typing import Optional, List

# create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="lavagna_cibo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- schemas ---
class RegisterIn(BaseModel):
    username: str
    password: str

class LoginIn(BaseModel):
    username: str
    password: str

class HouseCreateIn(BaseModel):
    name: str

class HouseJoinIn(BaseModel):
    invite_code: str

class BufferModeIn(BaseModel):
    mode: str

class SlotCreateIn(BaseModel):
    house_id: int
    date: str
    label: str

class PlateCreateIn(BaseModel):
    house_id: int
    date: Optional[str] = None
    slot_id: Optional[int] = None
    title: str
    note: Optional[str] = ""

class PlateUpdateIn(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None

class MoveIn(BaseModel):
    to_date: Optional[str] = None
    to_slot_id: Optional[int] = None

class VoteIn(BaseModel):
    value: int  # 1, -1, 0

def gen_invite():
    return secrets.token_hex(3).upper()

def ensure_slots(db: Session, house_id: int, date: str):
    existing = db.query(models.Slot).filter(models.Slot.house_id==house_id, models.Slot.date==date).all()
    if not existing:
        for idx, label in enumerate(["lunch","dinner"]):
            s = models.Slot(house_id=house_id, date=date, label=label, sort_order=idx)
            db.add(s)
        db.commit()
        existing = db.query(models.Slot).filter(models.Slot.house_id==house_id, models.Slot.date==date).order_by(models.Slot.sort_order).all()
    return existing

def plate_vote_stats(db: Session, plate_id: int, current_user_id: int):
    votes = db.query(models.Vote).filter(models.Vote.plate_id==plate_id).all()
    up = sum(1 for v in votes if v.value==1)
    down = sum(1 for v in votes if v.value==-1)
    score = up - down
    my = next((v.value for v in votes if v.user_id==current_user_id), 0)
    return {"score": score, "up": up, "down": down, "my_vote": my}

# --- auth ---
@app.post("/api/auth/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if not data.username.strip() or not data.password:
        raise HTTPException(400, "username and password required")
    if db.query(models.User).filter(models.User.username==data.username).first():
        raise HTTPException(400, "username taken")
    u = models.User(username=data.username.strip(), password_hash=auth.hash_password(data.password))
    db.add(u)
    db.commit()
    db.refresh(u)
    token = auth.create_token(u.id, u.username)
    return {"token": token, "user": {"id": u.id, "username": u.username}}

@app.post("/api/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.username==data.username).first()
    if not u or not auth.verify_password(data.password, u.password_hash):
        raise HTTPException(401, "invalid credentials")
    token = auth.create_token(u.id, u.username)
    return {"token": token, "user": {"id": u.id, "username": u.username}}

@app.get("/api/me")
def me(user: models.User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username}

# --- houses ---
@app.get("/api/houses")
def list_houses(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    memberships = db.query(models.Membership).filter(models.Membership.user_id==user.id).all()
    house_ids = [m.house_id for m in memberships]
    houses = db.query(models.House).filter(models.House.id.in_(house_ids)).all() if house_ids else []
    return [{"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "created_by": h.created_by} for h in houses]

@app.post("/api/houses")
def create_house(data: HouseCreateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "name required")
    if db.query(models.House).filter(models.House.name==name).first():
        raise HTTPException(400, "house name taken")
    invite = gen_invite()
    # ensure unique invite
    while db.query(models.House).filter(models.House.invite_code==invite).first():
        invite = gen_invite()
    h = models.House(name=name, invite_code=invite, buffer_mode="global", created_by=user.id)
    db.add(h)
    db.commit()
    db.refresh(h)
    db.add(models.Membership(user_id=user.id, house_id=h.id))
    db.commit()
    return {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode}

@app.post("/api/houses/join")
def join_house(data: HouseJoinIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = data.invite_code.strip().upper()
    # allow join by name as fallback
    h = db.query(models.House).filter(or_(models.House.invite_code==code, models.House.name==data.invite_code.strip())).first()
    if not h:
        raise HTTPException(404, "house not found")
    existing = db.query(models.Membership).filter(models.Membership.user_id==user.id, models.Membership.house_id==h.id).first()
    if not existing:
        db.add(models.Membership(user_id=user.id, house_id=h.id))
        db.commit()
    return {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode}

@app.get("/api/houses/{house_id}")
def get_house(house_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    h = db.query(models.House).filter(models.House.id==house_id).first()
    if not h:
        raise HTTPException(404, "not found")
    members = db.query(models.Membership).filter(models.Membership.house_id==house_id).all()
    users = db.query(models.User).filter(models.User.id.in_([m.user_id for m in members])).all() if members else []
    return {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "created_by": h.created_by, "members": [{"id": u.id, "username": u.username} for u in users]}

@app.put("/api/houses/{house_id}/buffer")
def set_buffer(house_id: int, data: BufferModeIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    if data.mode not in ("global","per_day"):
        raise HTTPException(400, "mode must be global or per_day")
    h = db.query(models.House).filter(models.House.id==house_id).first()
    if not h:
        raise HTTPException(404, "not found")
    h.buffer_mode = data.mode
    db.commit()
    return {"id": h.id, "buffer_mode": h.buffer_mode}

# --- calendar ---
@app.get("/api/calendar")
def get_calendar(house_id: int = Query(...), from_date: str = Query(..., alias="from"), to_date: str = Query(..., alias="to"), user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    h = db.query(models.House).filter(models.House.id==house_id).first()
    if not h:
        raise HTTPException(404, "house not found")
    # parse dates
    try:
        d_from = datetime.datetime.strptime(from_date, "%Y-%m-%d").date()
        d_to = datetime.datetime.strptime(to_date, "%Y-%m-%d").date()
    except:
        raise HTTPException(400, "invalid date format, use YYYY-MM-DD")
    if d_to < d_from:
        raise HTTPException(400, "to before from")
    days = []
    cur = d_from
    all_dates = []
    while cur <= d_to:
        all_dates.append(cur.isoformat())
        cur += datetime.timedelta(days=1)
    # ensure slots for each date
    for d in all_dates:
        ensure_slots(db, house_id, d)
    # fetch slots
    slots = db.query(models.Slot).filter(models.Slot.house_id==house_id, models.Slot.date.in_(all_dates)).order_by(models.Slot.date, models.Slot.sort_order).all()
    slots_by_date = {}
    for s in slots:
        slots_by_date.setdefault(s.date, []).append(s)
    # fetch plates: slot plates + per_day buffer + global buffer
    plates = db.query(models.Plate).filter(models.Plate.house_id==house_id, or_(models.Plate.date.in_(all_dates), models.Plate.date==None)).all()
    # group plates by slot vs buffer
    plates_by_slot = {}
    day_buffer_by_date = {d: [] for d in all_dates}
    global_buffer = []
    slot_ids = {s.id for s in slots}
    for p in plates:
        if p.slot_id is not None:
            # validate slot still exists, if not treat as buffer
            if p.slot_id in slot_ids:
                plates_by_slot.setdefault(p.slot_id, []).append(p)
            else:
                # orphaned slot, treat as per_day buffer if has date else global
                if p.date in day_buffer_by_date:
                    day_buffer_by_date[p.date].append(p)
                else:
                    global_buffer.append(p)
        else:
            if p.date is None:
                global_buffer.append(p)
            elif p.date in day_buffer_by_date:
                day_buffer_by_date[p.date].append(p)
            else:
                # out of range per_day but keep in global overflow
                global_buffer.append(p)

    def serialize_plate(p):
        stats = plate_vote_stats(db, p.id, user.id)
        return {"id": p.id, "title": p.title, "note": p.note, "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, "created_at": p.created_at.isoformat() if p.created_at else None, **stats}

    for d in all_dates:
        day_slots = []
        for s in slots_by_date.get(d, []):
            pls = [serialize_plate(p) for p in plates_by_slot.get(s.id, [])]
            # sort by score desc then created_at
            pls.sort(key=lambda x: (-x["score"], x["created_at"] or ""))
            day_slots.append({"id": s.id, "label": s.label, "sort_order": s.sort_order, "plates": pls})
        # sort slots by sort_order
        day_slots.sort(key=lambda x: x["sort_order"])
        day_buf = [serialize_plate(p) for p in day_buffer_by_date.get(d, [])]
        day_buf.sort(key=lambda x: (-x["score"], x["created_at"] or ""))
        days.append({"date": d, "slots": day_slots, "day_buffer": day_buf})

    glob = [serialize_plate(p) for p in global_buffer]
    glob.sort(key=lambda x: (-x["score"], x["created_at"] or ""))

    return {"house": {"id": h.id, "name": h.name, "buffer_mode": h.buffer_mode}, "days": days, "global_buffer": glob}

# --- slots ---
@app.post("/api/slots")
def create_slot(data: SlotCreateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, data.house_id, db)
    label = data.label.strip()
    if not label:
        raise HTTPException(400, "label required")
    try:
        datetime.datetime.strptime(data.date, "%Y-%m-%d")
    except:
        raise HTTPException(400, "invalid date")
    # check dup
    if db.query(models.Slot).filter(models.Slot.house_id==data.house_id, models.Slot.date==data.date, models.Slot.label==label).first():
        raise HTTPException(400, "slot label already exists for this date")
    max_order = db.query(func.max(models.Slot.sort_order)).filter(models.Slot.house_id==data.house_id, models.Slot.date==data.date).scalar()
    nxt = (max_order + 1) if max_order is not None else 0
    s = models.Slot(house_id=data.house_id, date=data.date, label=label, sort_order=nxt)
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "label": s.label, "date": s.date, "sort_order": s.sort_order}

@app.delete("/api/slots/{slot_id}")
def delete_slot(slot_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(models.Slot).filter(models.Slot.id==slot_id).first()
    if not s:
        raise HTTPException(404, "not found")
    require_membership(user.id, s.house_id, db)
    # move plates in this slot to per_day buffer or global buffer?
    plates = db.query(models.Plate).filter(models.Plate.slot_id==slot_id).all()
    for p in plates:
        p.slot_id = None
        # keep date as is so becomes day buffer
    db.delete(s)
    db.commit()
    return {"ok": True}

# --- plates ---
@app.post("/api/plates")
def create_plate(data: PlateCreateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, data.house_id, db)
    title = data.title.strip()
    if not title:
        raise HTTPException(400, "title required")
    # validate date/slot if provided
    slot_id = data.slot_id
    date = data.date
    if slot_id is not None:
        slot = db.query(models.Slot).filter(models.Slot.id==slot_id, models.Slot.house_id==data.house_id).first()
        if not slot:
            raise HTTPException(404, "slot not found")
        # ensure date matches slot date if date provided else take slot date
        if date and date != slot.date:
            raise HTTPException(400, "date must match slot date")
        date = slot.date
    else:
        # buffer plate
        if date is not None:
            try:
                datetime.datetime.strptime(date, "%Y-%m-%d")
            except:
                raise HTTPException(400, "invalid date")
        # date None => global buffer, date set => per_day buffer
    p = models.Plate(house_id=data.house_id, title=title, note=data.note or "", date=date, slot_id=slot_id, proposed_by=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    stats = plate_vote_stats(db, p.id, user.id)
    return {"id": p.id, "title": p.title, "note": p.note, "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, **stats}

@app.put("/api/plates/{plate_id}")
def update_plate(plate_id: int, data: PlateUpdateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Plate).filter(models.Plate.id==plate_id).first()
    if not p:
        raise HTTPException(404, "not found")
    require_membership(user.id, p.house_id, db)
    if p.proposed_by != user.id:
        raise HTTPException(403, "only creator can edit")
    if data.title is not None:
        t = data.title.strip()
        if not t:
            raise HTTPException(400, "title required")
        p.title = t
    if data.note is not None:
        p.note = data.note
    db.commit()
    db.refresh(p)
    stats = plate_vote_stats(db, p.id, user.id)
    return {"id": p.id, "title": p.title, "note": p.note, "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, **stats}

@app.post("/api/plates/{plate_id}/move")
def move_plate(plate_id: int, data: MoveIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Plate).filter(models.Plate.id==plate_id).first()
    if not p:
        raise HTTPException(404, "not found")
    require_membership(user.id, p.house_id, db)
    # any member can move, not only creator (per spec)
    to_slot_id = data.to_slot_id
    to_date = data.to_date
    if to_slot_id is not None:
        slot = db.query(models.Slot).filter(models.Slot.id==to_slot_id, models.Slot.house_id==p.house_id).first()
        if not slot:
            raise HTTPException(404, "target slot not found")
        if to_date and to_date != slot.date:
            raise HTTPException(400, "to_date must match slot date")
        to_date = slot.date
    else:
        # moving to buffer
        if to_date is not None:
            try:
                datetime.datetime.strptime(to_date, "%Y-%m-%d")
            except:
                raise HTTPException(400, "invalid to_date")
        # to_date None => global buffer, else per_day buffer
    p.slot_id = to_slot_id
    p.date = to_date
    db.commit()
    db.refresh(p)
    stats = plate_vote_stats(db, p.id, user.id)
    return {"id": p.id, "title": p.title, "note": p.note, "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, **stats}

@app.delete("/api/plates/{plate_id}")
def delete_plate(plate_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Plate).filter(models.Plate.id==plate_id).first()
    if not p:
        raise HTTPException(404, "not found")
    require_membership(user.id, p.house_id, db)
    if p.proposed_by != user.id:
        raise HTTPException(403, "only creator can delete")
    db.query(models.Vote).filter(models.Vote.plate_id==plate_id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}

# --- votes ---
@app.post("/api/plates/{plate_id}/vote")
def vote_plate(plate_id: int, data: VoteIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Plate).filter(models.Plate.id==plate_id).first()
    if not p:
        raise HTTPException(404, "not found")
    require_membership(user.id, p.house_id, db)
    if data.value not in (-1,0,1):
        raise HTTPException(400, "value must be -1,0,1")
    existing = db.query(models.Vote).filter(models.Vote.plate_id==plate_id, models.Vote.user_id==user.id).first()
    if data.value == 0:
        if existing:
            db.delete(existing)
            db.commit()
    else:
        if existing:
            existing.value = data.value
            db.commit()
        else:
            v = models.Vote(plate_id=plate_id, user_id=user.id, value=data.value)
            db.add(v)
            db.commit()
    stats = plate_vote_stats(db, plate_id, user.id)
    return {"plate_id": plate_id, **stats}

# --- autocomplete ---
@app.get("/api/plates/autocomplete")
def autocomplete(house_id: int = Query(...), q: str = Query("", alias="query"), limit: int = 8, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    q = q.strip()
    if not q:
        return []
    # ponytail: distinct scan over plates, add catalog if slow
    # query distinct titles matching prefix case-insensitive, ordered by frequency then recency
    # use lower(title) like lower(q)%
    pattern = q.lower() + "%"
    rows = db.query(models.Plate.title, func.count(models.Plate.id).label("cnt"), func.max(models.Plate.created_at).label("last")).filter(models.Plate.house_id==house_id, func.lower(models.Plate.title).like(pattern)).group_by(models.Plate.title).order_by(func.count(models.Plate.id).desc(), func.max(models.Plate.created_at).desc()).limit(limit).all()
    return [r[0] for r in rows]

# --- health ---
@app.get("/api/health")
def health():
    return {"ok": True}

# --- static frontend ---
# mount frontend as static, fallback to index.html for SPA
frontend_path = pathlib.Path(__file__).parent.parent / "frontend"
if not frontend_path.exists():
    # when running inside docker where backend and frontend are siblings under /app
    frontend_path = pathlib.Path("/app/frontend")
if not frontend_path.exists():
    frontend_path = pathlib.Path("frontend")

if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

    @app.get("/")
    def serve_root():
        idx = frontend_path / "index.html"
        if idx.exists():
            return FileResponse(str(idx))
        return {"detail": "frontend not found"}

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # if path is api, let it 404 (already handled)
        if full_path.startswith("api/"):
            raise HTTPException(404, "not found")
        requested = frontend_path / full_path
        if requested.exists() and requested.is_file():
            return FileResponse(str(requested))
        idx = frontend_path / "index.html"
        if idx.exists():
            return FileResponse(str(idx))
        raise HTTPException(404, "not found")
