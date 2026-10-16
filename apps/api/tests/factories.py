import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.operations import UserAccount, UserRole
from app.models.place import Place, PlaceType
from app.models.accessibility import (
    Feature, FeatureType, Evidence, EvidenceLabel, EvidenceSource, EvidenceStatus
)
from app.core.security import hash_password


def create_test_user(
    db: Session,
    email: Optional[str] = None,
    role: UserRole = UserRole.AUDITOR,
    password: str = "SecurePass123!"
) -> UserAccount:
    """Create a test user account inside the test database."""
    if email is None:
        email = f"user_{uuid.uuid4().hex[:8]}@saarthi.test"

    user = UserAccount(
        email=email,
        password_hash=hash_password(password),
        role=role,
        is_active=True
    )
    db.add(user)
    db.flush()
    return user


def create_test_place(
    db: Session,
    name: str = "Test Hospital",
    place_type: PlaceType = PlaceType.HOSPITAL,
    lat: float = 18.5204,
    lng: float = 73.8567,
    phone: Optional[str] = None
) -> Place:
    """Create a test place record inside the test database."""
    place = Place(
        name=name,
        type=place_type,
        address="123 Test Street, Pune",
        phone=phone,
        geom=f"SRID=4326;POINT({lng} {lat})",
        source="test"
    )
    db.add(place)
    db.flush()
    return place


def create_test_feature(
    db: Session,
    place_id: uuid.UUID,
    name: str = "Main Entrance",
    feature_type: FeatureType = FeatureType.ENTRANCE,
    floor_level: int = 0
) -> Feature:
    """Create a test feature record for a place."""
    feature = Feature(
        place_id=place_id,
        name=name,
        type=feature_type,
        floor_level=floor_level
    )
    db.add(feature)
    db.flush()
    return feature


def create_test_evidence(
    db: Session,
    feature_id: uuid.UUID,
    attribute_key: str = "step_count",
    value: Any = 0,
    label: EvidenceLabel = EvidenceLabel.VERIFIED,
    source: EvidenceSource = EvidenceSource.AUDITOR,
    observer_id: Optional[uuid.UUID] = None,
    verifier_id: Optional[uuid.UUID] = None,
    observed_at: Optional[datetime] = None,
    expires_at: Optional[datetime] = None,
    status: EvidenceStatus = EvidenceStatus.APPROVED
) -> Evidence:
    """Create a test evidence record complying with database check constraints."""
    now = datetime.now(timezone.utc)
    if observed_at is None:
        observed_at = now - timedelta(days=5)
    if expires_at is None:
        expires_at = now + timedelta(days=85)

    evidence = Evidence(
        feature_id=feature_id,
        attribute_key=attribute_key,
        value=value,
        label=label,
        source=source,
        observer_id=observer_id,
        verifier_id=verifier_id,
        observed_at=observed_at,
        expires_at=expires_at,
        status=status
    )
    db.add(evidence)
    db.flush()
    return evidence
