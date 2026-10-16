import uuid
from enum import Enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, Boolean, ForeignKey,
    DateTime, Enum as SQLEnum, CheckConstraint, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.database import Base


class FeatureType(str, Enum):
    ENTRANCE = "entrance"
    RAMP = "ramp"
    LIFT = "lift"
    TOILET = "toilet"
    COUNTER = "counter"
    SIGNAGE = "signage"
    TACTILE_PATH = "tactile_path"
    COMM_SUPPORT = "comm_support"
    CROSSING = "crossing"
    KERB = "kerb"
    BUS_STOP_PLATFORM = "bus_stop_platform"


class AttrValueType(str, Enum):
    NUMBER = "number"
    BOOLEAN = "boolean"
    STRING = "string"
    ENUM = "enum"


class EvidenceLabel(str, Enum):
    VERIFIED = "verified"
    REPORTED = "reported"
    TEMPORARY_BARRIER = "temporary_barrier"
    BARRIER = "barrier"


class EvidenceSource(str, Enum):
    AUDITOR = "auditor"
    USER = "user"
    OSM = "osm"
    AI = "ai"
    IMPORT = "import"


class EvidenceStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class RuleOperator(str, Enum):
    EQ = "eq"
    NEQ = "neq"
    LTE = "lte"
    GTE = "gte"
    IN = "in"
    NOT_IN = "not_in"


def enum_values(enum_cls):
    return [e.value for e in enum_cls]


class Feature(Base):
    __tablename__ = "feature"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    place_id = Column(UUID(as_uuid=True), ForeignKey("place.id", ondelete="CASCADE"), nullable=True, index=True)
    segment_id = Column(UUID(as_uuid=True), ForeignKey("segment.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(SQLEnum(FeatureType, name="feature_type", values_callable=enum_values), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    floor_level = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    place = relationship("Place", back_populates="features")
    segment = relationship("Segment", back_populates="features")
    evidence_items = relationship("Evidence", back_populates="feature", cascade="all, delete-orphan")
    user_reports = relationship("UserReport", back_populates="feature", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "(place_id IS NOT NULL) OR (segment_id IS NOT NULL)",
            name="chk_feature_has_parent"
        ),
    )


class AttributeDef(Base):
    __tablename__ = "attribute_def"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feature_type = Column(SQLEnum(FeatureType, name="feature_type", values_callable=enum_values, create_type=False), nullable=False)
    key = Column(String(100), nullable=False)
    value_type = Column(SQLEnum(AttrValueType, name="attr_value_type", values_callable=enum_values), nullable=False)
    unit = Column(String(50), nullable=True)
    description = Column(Text, nullable=False)

    __table_args__ = (
        UniqueConstraint("feature_type", "key", name="uq_attribute_def_type_key"),
    )


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feature_id = Column(UUID(as_uuid=True), ForeignKey("feature.id", ondelete="CASCADE"), nullable=False, index=True)
    attribute_key = Column(String(100), nullable=False, index=True)
    value = Column(JSONB, nullable=False)
    label = Column(SQLEnum(EvidenceLabel, name="evidence_label", values_callable=enum_values), nullable=False, index=True)
    source = Column(SQLEnum(EvidenceSource, name="evidence_source", values_callable=enum_values), nullable=False)
    observer_id = Column(UUID(as_uuid=True), ForeignKey("user_account.id", ondelete="SET NULL"), nullable=True)
    verifier_id = Column(UUID(as_uuid=True), ForeignKey("user_account.id", ondelete="SET NULL"), nullable=True)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    photo_ids = Column(ARRAY(UUID(as_uuid=True)), default=list, nullable=False)
    note = Column(Text, nullable=True)
    status = Column(SQLEnum(EvidenceStatus, name="evidence_status", values_callable=enum_values), default=EvidenceStatus.PENDING, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    feature = relationship("Feature", back_populates="evidence_items")
    observer = relationship("UserAccount", foreign_keys=[observer_id])
    verifier = relationship("UserAccount", foreign_keys=[verifier_id])

    __table_args__ = (
        # RULE 3: AI output can NEVER be verified
        CheckConstraint(
            "NOT (source = 'ai' AND label = 'verified')",
            name="chk_evidence_ai_never_verified"
        ),
        # RULE 4: Collector is NOT verifier
        CheckConstraint(
            "verifier_id IS NULL OR verifier_id <> observer_id",
            name="chk_evidence_verifier_not_observer"
        ),
        # RULE 4: Verified label requires a verifier
        CheckConstraint(
            "label <> 'verified' OR verifier_id IS NOT NULL",
            name="chk_evidence_verified_requires_verifier"
        ),
        # Expiry must be strictly after observation
        CheckConstraint(
            "expires_at > observed_at",
            name="chk_evidence_expiry_after_observed"
        ),
    )


class NeedRule(Base):
    __tablename__ = "need_rule"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    need_code = Column(String(100), nullable=False, index=True)
    feature_type = Column(SQLEnum(FeatureType, name="feature_type", values_callable=enum_values, create_type=False), nullable=False)
    attribute_key = Column(String(100), nullable=False)
    operator = Column(SQLEnum(RuleOperator, name="rule_operator", values_callable=enum_values), nullable=False)
    threshold = Column(JSONB, nullable=False)
    critical = Column(Boolean, default=True, nullable=False)


class UserReport(Base):
    __tablename__ = "user_report"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feature_id = Column(UUID(as_uuid=True), ForeignKey("feature.id", ondelete="CASCADE"), nullable=False, index=True)
    attribute_key = Column(String(100), nullable=False, index=True)
    value = Column(JSONB, nullable=False)
    photo_ids = Column(ARRAY(UUID(as_uuid=True)), default=list, nullable=False)
    anonymous_token = Column(String(255), nullable=False, index=True)
    comment = Column(Text, nullable=True)
    status = Column(String(50), default="open", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    feature = relationship("Feature", back_populates="user_reports")
