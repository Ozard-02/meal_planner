from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
import datetime
from db import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

class House(Base):
    __tablename__ = "houses"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    invite_code = Column(String, unique=True, nullable=False, index=True)
    buffer_mode = Column(String, default="global", nullable=False)  # global or per_day
    daily_template = Column(Text, default='["lunch","dinner"]', nullable=False)  # JSON array of labels
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)

class Membership(Base):
    __tablename__ = "memberships"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    house_id = Column(Integer, ForeignKey("houses.id"), primary_key=True)

class Slot(Base):
    __tablename__ = "slots"
    id = Column(Integer, primary_key=True, index=True)
    house_id = Column(Integer, ForeignKey("houses.id"), nullable=False, index=True)
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    label = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    __table_args__ = (UniqueConstraint('house_id','date','label', name='uq_slot'),)

class Plate(Base):
    __tablename__ = "plates"
    id = Column(Integer, primary_key=True, index=True)
    house_id = Column(Integer, ForeignKey("houses.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    note = Column(Text, default="", nullable=False)
    tags = Column(Text, default="", nullable=False)  # comma-separated lower tags, e.g. "fish,meat"
    date = Column(String, nullable=True, index=True)  # null = global buffer
    slot_id = Column(Integer, ForeignKey("slots.id"), nullable=True, index=True)
    proposed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Vote(Base):
    __tablename__ = "votes"
    plate_id = Column(Integer, ForeignKey("plates.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    value = Column(Integer, nullable=False)  # 1 or -1
