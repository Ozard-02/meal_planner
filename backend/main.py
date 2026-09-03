from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
import os, secrets, pathlib, datetime, json

from db import get_db, engine, Base
import models
import auth
from auth import get_current_user, require_membership
from pydantic import BaseModel
from typing import Optional, List

# --- migration for new columns (SQLite) ---
def ensure_migrations():
    try:
        with engine.connect() as conn:
            # houses.daily_template
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(houses)")).fetchall()]
            if "daily_template" not in cols:
                conn.execute(text("ALTER TABLE houses ADD COLUMN daily_template TEXT DEFAULT '[\"lunch\",\"dinner\"]'"))
                conn.commit()
            # plates.tags
            cols2 = [row[1] for row in conn.execute(text("PRAGMA table_info(plates)")).fetchall()]
            if "tags" not in cols2:
                conn.execute(text("ALTER TABLE plates ADD COLUMN tags TEXT DEFAULT ''"))
                conn.commit()
            # backfill nulls
            conn.execute(text("UPDATE houses SET daily_template='[\"lunch\",\"dinner\"]' WHERE daily_template IS NULL"))
            conn.execute(text("UPDATE plates SET tags='' WHERE tags IS NULL"))
            conn.commit()
    except Exception as e:
        print("migration check failed", e)

# create tables first
Base.metadata.create_all(bind=engine)
ensure_migrations()

app = FastAPI(title="lavagna_cibo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- helpers ---
def gen_invite():
    return secrets.token_hex(3).upper()

def today_iso():
    return datetime.datetime.utcnow().date().isoformat()

def is_past(date_str: Optional[str]) -> bool:
    if not date_str:
        return False
    try:
        return date_str < today_iso()
    except:
        return False

def normalize_tags(tags_str: Optional[str]) -> str:
    if not tags_str:
        return ""
    # allow comma or space or list string? split by comma
    parts = []
    for p in tags_str.split(","):
        t = p.strip().lower()
        if t and t not in parts:
            parts.append(t)
        if len(parts) >= 8:
            break
    # optional: limit each tag length 20
    parts = [t[:20] for t in parts]
    return ",".join(parts)

def tags_to_list(tags_str: str) -> List[str]:
    if not tags_str:
        return []
    return [t for t in tags_str.split(",") if t]

def get_template_labels(house: models.House) -> List[str]:
    try:
        arr = json.loads(house.daily_template or '["lunch","dinner"]')
        if isinstance(arr, list) and arr:
            # normalize: strip, lower keep original case? keep as is but strip
            labels = [str(x).strip() for x in arr if str(x).strip()]
            # dedup case-insensitive but keep first
            seen=set()
            uniq=[]
            for lb in labels:
                low=lb.lower()
                if low not in seen:
                    seen.add(low)
                    uniq.append(lb)
            return uniq[:8] if uniq else ["lunch","dinner"]
    except:
        pass
    return ["lunch","dinner"]

def ensure_slots(db: Session, house_id: int, date: str):
    existing = db.query(models.Slot).filter(models.Slot.house_id==house_id, models.Slot.date==date).all()
    if not existing:
        house = db.query(models.House).filter(models.House.id==house_id).first()
        labels = get_template_labels(house) if house else ["lunch","dinner"]
        for idx, label in enumerate(labels):
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

class HouseUpdateIn(BaseModel):
    name: Optional[str] = None

class BufferModeIn(BaseModel):
    mode: str

class TemplateIn(BaseModel):
    labels: List[str]

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
    tags: Optional[str] = ""

class PlateUpdateIn(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[str] = None

class MoveIn(BaseModel):
    to_date: Optional[str] = None
    to_slot_id: Optional[int] = None

class VoteIn(BaseModel):
    value: int

class MeUpdateIn(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    new_password: Optional[str] = None

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

@app.put("/api/me")
def update_me(data: MeUpdateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # username change
    if data.username is not None:
        new_u = data.username.strip()
        if not new_u:
            raise HTTPException(400, "username required")
        if new_u != user.username and db.query(models.User).filter(models.User.username==new_u).first():
            raise HTTPException(400, "username taken")
        user.username = new_u
    # password change
    if data.new_password is not None:
        if not data.password or not auth.verify_password(data.password, user.password_hash):
            raise HTTPException(400, "current password incorrect")
        if not data.new_password:
            raise HTTPException(400, "new password required")
        user.password_hash = auth.hash_password(data.new_password)
    db.commit()
    db.refresh(user)
    # issue new token if username changed
    token = auth.create_token(user.id, user.username)
    return {"id": user.id, "username": user.username, "token": token}

# --- houses ---
@app.get("/api/houses")
def list_houses(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    memberships = db.query(models.Membership).filter(models.Membership.user_id==user.id).all()
    house_ids = [m.house_id for m in memberships]
    houses = db.query(models.House).filter(models.House.id.in_(house_ids)).all() if house_ids else []
    res=[]
    for h in houses:
        tpl=get_template_labels(h)
        res.append({"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "daily_template": tpl, "created_by": h.created_by})
    return res

@app.post("/api/houses")
def create_house(data: HouseCreateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "name required")
    if db.query(models.House).filter(models.House.name==name).first():
        raise HTTPException(400, "house name taken")
    invite = gen_invite()
    while db.query(models.House).filter(models.House.invite_code==invite).first():
        invite = gen_invite()
    h = models.House(name=name, invite_code=invite, buffer_mode="global", daily_template='["lunch","dinner"]', created_by=user.id)
    db.add(h)
    db.commit()
    db.refresh(h)
    db.add(models.Membership(user_id=user.id, house_id=h.id))
    db.commit()
    return {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "daily_template": get_template_labels(h)}

@app.post("/api/houses/join")
def join_house(data: HouseJoinIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = data.invite_code.strip().upper()
    h = db.query(models.House).filter(or_(models.House.invite_code==code, models.House.name==data.invite_code.strip())).first()
    if not h:
        raise HTTPException(404, "house not found")
    existing = db.query(models.Membership).filter(models.Membership.user_id==user.id, models.Membership.house_id==h.id).first()
    if not existing:
        db.add(models.Membership(user_id=user.id, house_id=h.id))
        db.commit()
    return {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "daily_template": get_template_labels(h)}

@app.get("/api/houses/{house_id}")
def get_house(house_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    h = db.query(models.House).filter(models.House.id==house_id).first()
    if not h:
        raise HTTPException(404, "not found")
    members = db.query(models.Membership).filter(models.Membership.house_id==house_id).all()
    users = db.query(models.User).filter(models.User.id.in_([m.user_id for m in members])).all() if members else []
    return {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "daily_template": get_template_labels(h), "created_by": h.created_by, "members": [{"id": u.id, "username": u.username} for u in users]}

@app.put("/api/houses/{house_id}")
def update_house(house_id: int, data: HouseUpdateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    h = db.query(models.House).filter(models.House.id==house_id).first()
    if not h:
        raise HTTPException(404, "not found")
    if data.name is not None:
        name=data.name.strip()
        if not name:
            raise HTTPException(400, "name required")
        if name!=h.name and db.query(models.House).filter(models.House.name==name).first():
            raise HTTPException(400, "house name taken")
        h.name=name
    db.commit()
    db.refresh(h)
    return {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "daily_template": get_template_labels(h)}

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

@app.put("/api/houses/{house_id}/template")
def set_template(house_id: int, data: TemplateIn, apply_future: bool = False, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    h = db.query(models.House).filter(models.House.id==house_id).first()
    if not h:
        raise HTTPException(404, "not found")
    labels=[]
    seen=set()
    for lb in data.labels:
        t=str(lb).strip()
        if not t:
            continue
        low=t.lower()
        if low in seen:
            continue
        seen.add(low)
        labels.append(t)
        if len(labels)>=8:
            break
    if not labels:
        raise HTTPException(400, "at least one label required")
    if len(labels)>8:
        raise HTTPException(400, "max 8 slots")
    h.daily_template = json.dumps(labels)
    db.commit()
    # optionally apply to future dates >= today — make future dates exactly match template
    if apply_future:
        today=today_iso()
        future_dates = [row[0] for row in db.query(models.Slot.date).filter(models.Slot.house_id==house_id, models.Slot.date>=today).distinct().all()]
        template_set = set(lb.lower() for lb in labels)
        for d in future_dates:
            existing = db.query(models.Slot).filter(models.Slot.house_id==house_id, models.Slot.date==d).all()
            existing_map = {s.label.lower(): s for s in existing}
            # update order and add missing
            for idx, lab in enumerate(labels):
                low=lab.lower()
                if low in existing_map:
                    existing_map[low].sort_order = idx
                    existing_map[low].label = lab  # preserve new casing
                else:
                    ns = models.Slot(house_id=house_id, date=d, label=lab, sort_order=idx)
                    db.add(ns)
            # delete slots not in template (move their plates to day buffer)
            for s in existing:
                if s.label.lower() not in template_set:
                    plates = db.query(models.Plate).filter(models.Plate.slot_id==s.id).all()
                    for p in plates:
                        p.slot_id = None
                        # keep date for day buffer
                    db.delete(s)
        db.commit()
    db.refresh(h)
    return {"id": h.id, "daily_template": get_template_labels(h)}

# --- calendar ---
@app.get("/api/calendar")
def get_calendar(house_id: int = Query(...), from_date: str = Query(..., alias="from"), to_date: str = Query(..., alias="to"), user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    h = db.query(models.House).filter(models.House.id==house_id).first()
    if not h:
        raise HTTPException(404, "house not found")
    try:
        d_from = datetime.datetime.strptime(from_date, "%Y-%m-%d").date()
        d_to = datetime.datetime.strptime(to_date, "%Y-%m-%d").date()
    except:
        raise HTTPException(400, "invalid date format, use YYYY-MM-DD")
    if d_to < d_from:
        raise HTTPException(400, "to before from")
    cur = d_from
    all_dates = []
    while cur <= d_to:
        all_dates.append(cur.isoformat())
        cur += datetime.timedelta(days=1)
    for d in all_dates:
        ensure_slots(db, house_id, d)
    slots = db.query(models.Slot).filter(models.Slot.house_id==house_id, models.Slot.date.in_(all_dates)).order_by(models.Slot.date, models.Slot.sort_order).all()
    slots_by_date = {}
    for s in slots:
        slots_by_date.setdefault(s.date, []).append(s)
    plates = db.query(models.Plate).filter(models.Plate.house_id==house_id, or_(models.Plate.date.in_(all_dates), models.Plate.date==None)).all()
    plates_by_slot = {}
    day_buffer_by_date = {d: [] for d in all_dates}
    global_buffer = []
    slot_ids = {s.id for s in slots}
    for p in plates:
        if p.slot_id is not None:
            if p.slot_id in slot_ids:
                plates_by_slot.setdefault(p.slot_id, []).append(p)
            else:
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
                global_buffer.append(p)

    def serialize_plate(p):
        stats = plate_vote_stats(db, p.id, user.id)
        return {"id": p.id, "title": p.title, "note": p.note, "tags": tags_to_list(p.tags or ""), "tags_str": p.tags or "", "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, "created_at": p.created_at.isoformat() if p.created_at else None, **stats}

    days=[]
    for d in all_dates:
        day_slots=[]
        for s in slots_by_date.get(d, []):
            pls = [serialize_plate(p) for p in plates_by_slot.get(s.id, [])]
            pls.sort(key=lambda x: (-x["score"], x["created_at"] or ""))
            day_slots.append({"id": s.id, "label": s.label, "sort_order": s.sort_order, "plates": pls})
        day_slots.sort(key=lambda x: x["sort_order"])
        day_buf = [serialize_plate(p) for p in day_buffer_by_date.get(d, [])]
        day_buf.sort(key=lambda x: (-x["score"], x["created_at"] or ""))
        days.append({"date": d, "slots": day_slots, "day_buffer": day_buf})
    glob = [serialize_plate(p) for p in global_buffer]
    glob.sort(key=lambda x: (-x["score"], x["created_at"] or ""))
    return {"house": {"id": h.id, "name": h.name, "invite_code": h.invite_code, "buffer_mode": h.buffer_mode, "daily_template": get_template_labels(h)}, "days": days, "global_buffer": glob}

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
    if is_past(data.date):
        raise HTTPException(400, "past days not modifiable")
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
    if is_past(s.date):
        raise HTTPException(400, "past days not modifiable")
    plates = db.query(models.Plate).filter(models.Plate.slot_id==slot_id).all()
    for p in plates:
        p.slot_id = None
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
    tags = normalize_tags(data.tags or "")
    slot_id = data.slot_id
    date = data.date
    if slot_id is not None:
        slot = db.query(models.Slot).filter(models.Slot.id==slot_id, models.Slot.house_id==data.house_id).first()
        if not slot:
            raise HTTPException(404, "slot not found")
        if date and date != slot.date:
            raise HTTPException(400, "date must match slot date")
        date = slot.date
    else:
        if date is not None:
            try:
                datetime.datetime.strptime(date, "%Y-%m-%d")
            except:
                raise HTTPException(400, "invalid date")
    if is_past(date):
        raise HTTPException(400, "past days not modifiable")
    p = models.Plate(house_id=data.house_id, title=title, note=data.note or "", tags=tags, date=date, slot_id=slot_id, proposed_by=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    stats = plate_vote_stats(db, p.id, user.id)
    return {"id": p.id, "title": p.title, "note": p.note, "tags": tags_to_list(p.tags), "tags_str": p.tags, "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, **stats}

@app.put("/api/plates/{plate_id}")
def update_plate(plate_id: int, data: PlateUpdateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Plate).filter(models.Plate.id==plate_id).first()
    if not p:
        raise HTTPException(404, "not found")
    require_membership(user.id, p.house_id, db)
    if is_past(p.date):
        raise HTTPException(400, "past days not modifiable")
    if p.proposed_by != user.id:
        raise HTTPException(403, "only creator can edit")
    if data.title is not None:
        t = data.title.strip()
        if not t:
            raise HTTPException(400, "title required")
        p.title = t
    if data.note is not None:
        p.note = data.note
    if data.tags is not None:
        p.tags = normalize_tags(data.tags)
    db.commit()
    db.refresh(p)
    stats = plate_vote_stats(db, p.id, user.id)
    return {"id": p.id, "title": p.title, "note": p.note, "tags": tags_to_list(p.tags), "tags_str": p.tags, "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, **stats}

@app.post("/api/plates/{plate_id}/move")
def move_plate(plate_id: int, data: MoveIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Plate).filter(models.Plate.id==plate_id).first()
    if not p:
        raise HTTPException(404, "not found")
    require_membership(user.id, p.house_id, db)
    if is_past(p.date):
        raise HTTPException(400, "past days not modifiable")
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
        if to_date is not None:
            try:
                datetime.datetime.strptime(to_date, "%Y-%m-%d")
            except:
                raise HTTPException(400, "invalid to_date")
    if is_past(to_date):
        raise HTTPException(400, "past days not modifiable")
    p.slot_id = to_slot_id
    p.date = to_date
    db.commit()
    db.refresh(p)
    stats = plate_vote_stats(db, p.id, user.id)
    return {"id": p.id, "title": p.title, "note": p.note, "tags": tags_to_list(p.tags), "tags_str": p.tags, "date": p.date, "slot_id": p.slot_id, "proposed_by": p.proposed_by, **stats}

@app.delete("/api/plates/history")
def delete_history(house_id: int = Query(...), title: str = Query(...), user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    title = title.strip()
    if not title:
        raise HTTPException(400, "title required")
    plates = db.query(models.Plate).filter(models.Plate.house_id==house_id, func.lower(models.Plate.title)==title.lower()).all()
    if not plates:
        raise HTTPException(404, "not found")
    ids = [p.id for p in plates]
    db.query(models.Vote).filter(models.Vote.plate_id.in_(ids)).delete(synchronize_session=False)
    for p in plates:
        db.delete(p)
    db.commit()
    return {"ok": True, "deleted": len(ids), "title": title}

@app.delete("/api/plates/{plate_id}")
def delete_plate(plate_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Plate).filter(models.Plate.id==plate_id).first()
    if not p:
        raise HTTPException(404, "not found")
    require_membership(user.id, p.house_id, db)
    if is_past(p.date):
        raise HTTPException(400, "past days not modifiable")
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
    if is_past(p.date):
        raise HTTPException(400, "past days not modifiable")
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
    pattern = q.lower() + "%"
    # ponytail: case-insensitive distinct — group by lower(title), keep first casing via MIN(title)
    rows = db.query(func.min(models.Plate.title).label("title"), func.count(models.Plate.id).label("cnt"), func.max(models.Plate.created_at).label("last")).filter(models.Plate.house_id==house_id, func.lower(models.Plate.title).like(pattern)).group_by(func.lower(models.Plate.title)).order_by(func.count(models.Plate.id).desc(), func.max(models.Plate.created_at).desc()).limit(limit).all()
    return [r[0] for r in rows]

@app.get("/api/tags/autocomplete")
def tags_autocomplete(house_id: int = Query(...), q: str = Query("", alias="query"), limit: int = 8, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    q = q.strip().lower()
    if not q:
        return []
    # ponytail: tags are comma-separated lower strings — aggregate frequencies in Python (few hundred plates max)
    rows = db.query(models.Plate.tags).filter(models.Plate.house_id==house_id).all()
    freq={}
    for (tags_str,) in rows:
        if not tags_str:
            continue
        for t in tags_str.split(","):
            tt=t.strip().lower()
            if not tt:
                continue
            freq[tt]=freq.get(tt,0)+1
    # filter prefix
    matched=[(tag,cnt) for tag,cnt in freq.items() if tag.startswith(q)]
    matched.sort(key=lambda x: (-x[1], x[0]))
    return [tag for tag,cnt in matched[:limit]]

# --- history ---
@app.get("/api/plates/history")
def history(house_id: int = Query(...), sort: str = Query("name"), limit: int = Query(100), q: str = Query(""), tag: str = Query(""), user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_membership(user.id, house_id, db)
    sort = sort if sort in ("name","recent","count") else "name"
    q = q.strip().lower()
    tag = tag.strip().lower()
    # distinct titles case-insensitive — group by lower(title), keep original casing via MIN(title)
    query = db.query(
        func.min(models.Plate.title).label("title"),
        func.count(models.Plate.id).label("cnt"),
        func.max(models.Plate.created_at).label("last"),
        func.group_concat(models.Plate.tags, ",").label("tags_agg"),
        func.max(models.Plate.note).label("example_note")
    ).filter(models.Plate.house_id==house_id).group_by(func.lower(models.Plate.title))
    if q:
        query = query.filter(func.lower(models.Plate.title).like(f"%{q}%"))
    rows = query.all()
    # post-filter by tag (since tags stored comma)
    filtered=[]
    for title,cnt,last,tags_agg,example_note in rows:
        # aggregate tags distinct
        all_tags=[]
        seen=set()
        if tags_agg:
            for chunk in tags_agg.split(","):
                for t in chunk.split(","):
                    tt=t.strip().lower()
                    if tt and tt not in seen:
                        seen.add(tt)
                        all_tags.append(tt)
        if tag and tag not in all_tags:
            continue
        filtered.append({"title":title,"count":cnt,"last_used": last.isoformat() if last else None,"tags": all_tags,"example_note": example_note or ""})
    if sort=="name":
        filtered.sort(key=lambda x: x["title"].lower())
    elif sort=="recent":
        filtered.sort(key=lambda x: x["last_used"] or "", reverse=True)
    else: # count
        filtered.sort(key=lambda x: (-x["count"], x["title"].lower()))
    return filtered[:limit]

# --- health ---
@app.get("/api/health")
def health():
    return {"ok": True}

# --- static frontend ---
frontend_path = pathlib.Path(__file__).parent.parent / "frontend"
if not frontend_path.exists():
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
        if full_path.startswith("api/"):
            raise HTTPException(404, "not found")
        requested = frontend_path / full_path
        if requested.exists() and requested.is_file():
            return FileResponse(str(requested))
        idx = frontend_path / "index.html"
        if idx.exists():
            return FileResponse(str(idx))
        raise HTTPException(404, "not found")
