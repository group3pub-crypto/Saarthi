import uuid
from enum import Enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Boolean, Float, ForeignKey,
    DateTime, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(str, Enum):
    AUDITOR = "auditor"
    VERIFIER = "verifier"
    MODERATOR = "moderator"
    ADMIN = "admin"
    INSTITUTION_ADMIN = "institution_admin"
    PARTNER_NGO = "partner_ngo"


class SuggestionKind(str, Enum):
    TRIAGE = "triage"
    PHOTO_TAG = "photo_tag"
    DUPLICATE = "duplicate"
    STALE_PREDICTION = "stale_prediction"
    CONFLICT_SCORE = "conflict_score"


class SuggestionStatus(str, Enum):
    OPEN = "open"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"


def enum_values(enum_cls):
    return [e.value for e in enum_cls]


class UserAccount(Base):
    __tablename__ = "user_account"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole, name="user_role", values_callable=enum_values), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class Suggestion(Base):
    __tablename__ = "suggestion"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind = Column(SQLEnum(SuggestionKind, name="suggestion_kind", values_callable=enum_values), nullable=False, index=True)
    payload = Column(JSONB, nullable=False)
    target_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    model = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    status = Column(SQLEnum(SuggestionStatus, name="suggestion_status", values_callable=enum_values), default=SuggestionStatus.OPEN, nullable=False, index=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("user_account.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    reviewer = relationship("UserAccount", foreign_keys=[reviewed_by])


class Photo(Base):
    __tablename__ = "photo"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    storage_key = Column(String(500), nullable=False)
    blurred = Column(Boolean, default=False, nullable=False)
    consent_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class Escalation(Base):
    __tablename__ = "escalation"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feature_id = Column(UUID(as_uuid=True), ForeignKey("feature.id", ondelete="SET NULL"), nullable=True)
    evidence_id = Column(UUID(as_uuid=True), ForeignKey("evidence.id", ondelete="SET NULL"), nullable=True)
    authority = Column(String(255), nullable=False)
    forwarded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    deadline = Column(DateTime(timezone=True), nullable=False)
    public_status = Column(String(100), nullable=False)
    public_note = Column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("user_account.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity = Column(String(100), nullable=False, index=True)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    before = Column(JSONB, nullable=True)
    after = Column(JSONB, nullable=True)
    at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    actor = relationship("UserAccount", foreign_keys=[actor_id])


class Setting(Base):
    __tablename__ = "setting"

    key = Column(String(100), primary_key=True)
    value = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class MetricEvent(Base):
    __tablename__ = "metric_event"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, index=True)
    anonymous_session = Column(String(255), nullable=False, index=True)
    props = Column(JSONB, default=dict, nullable=False)
    at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
