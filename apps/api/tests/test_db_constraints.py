import uuid
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy import text
from app.models.accessibility import (
    Evidence, EvidenceLabel, EvidenceSource, EvidenceStatus, FeatureType
)
from app.models.operations import UserRole, AuditLog
from tests.factories import (
    create_test_user, create_test_place, create_test_feature
)


def test_ai_cannot_be_verified(db_session):
    """RULE 3 & CHECK constraint: AI output can NEVER have label='verified'."""
    place = create_test_place(db_session)
    feature = create_test_feature(db_session, place.id)
    verifier = create_test_user(db_session, role=UserRole.VERIFIER)

    now = datetime.now(timezone.utc)
    evidence = Evidence(
        feature_id=feature.id,
        attribute_key="ramp_slope_pct",
        value=5.0,
        label=EvidenceLabel.VERIFIED,
        source=EvidenceSource.AI,
        verifier_id=verifier.id,
        observed_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=90),
        status=EvidenceStatus.APPROVED
    )
    db_session.add(evidence)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    assert "chk_evidence_ai_never_verified" in str(exc_info.value)
    db_session.rollback()


def test_collector_cannot_verify_own_observation(db_session):
    """RULE 4 & CHECK constraint: verifier_id must not equal observer_id."""
    place = create_test_place(db_session)
    feature = create_test_feature(db_session, place.id)
    auditor = create_test_user(db_session, role=UserRole.AUDITOR)

    now = datetime.now(timezone.utc)
    evidence = Evidence(
        feature_id=feature.id,
        attribute_key="step_count",
        value=0,
        label=EvidenceLabel.VERIFIED,
        source=EvidenceSource.AUDITOR,
        observer_id=auditor.id,
        verifier_id=auditor.id, # Illegal: Self-verification!
        observed_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=90),
        status=EvidenceStatus.APPROVED
    )
    db_session.add(evidence)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    assert "chk_evidence_verifier_not_observer" in str(exc_info.value)
    db_session.rollback()


def test_verified_requires_verifier(db_session):
    """RULE 4 & CHECK constraint: label='verified' requires a non-null verifier_id."""
    place = create_test_place(db_session)
    feature = create_test_feature(db_session, place.id)
    auditor = create_test_user(db_session, role=UserRole.AUDITOR)

    now = datetime.now(timezone.utc)
    evidence = Evidence(
        feature_id=feature.id,
        attribute_key="door_width_cm",
        value=95.0,
        label=EvidenceLabel.VERIFIED,
        source=EvidenceSource.AUDITOR,
        observer_id=auditor.id,
        verifier_id=None, # Missing verifier!
        observed_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=90),
        status=EvidenceStatus.APPROVED
    )
    db_session.add(evidence)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    assert "chk_evidence_verified_requires_verifier" in str(exc_info.value)
    db_session.rollback()


def test_expiry_must_be_after_observed(db_session):
    """CHECK constraint: expires_at must be strictly greater than observed_at."""
    place = create_test_place(db_session)
    feature = create_test_feature(db_session, place.id)
    auditor = create_test_user(db_session, role=UserRole.AUDITOR)

    now = datetime.now(timezone.utc)
    evidence = Evidence(
        feature_id=feature.id,
        attribute_key="tactile_paving",
        value=True,
        label=EvidenceLabel.REPORTED,
        source=EvidenceSource.USER,
        observed_at=now,
        expires_at=now - timedelta(days=1), # Expired before observation!
        status=EvidenceStatus.APPROVED
    )
    db_session.add(evidence)

    with pytest.raises(IntegrityError) as exc_info:
        db_session.flush()

    assert "chk_evidence_expiry_after_observed" in str(exc_info.value)
    db_session.rollback()


def test_valid_evidence_creation_succeeds(db_session):
    """Proves that valid multi-party audit and verification successfully persists."""
    place = create_test_place(db_session)
    feature = create_test_feature(db_session, place.id)
    auditor = create_test_user(db_session, role=UserRole.AUDITOR)
    verifier = create_test_user(db_session, role=UserRole.VERIFIER)

    now = datetime.now(timezone.utc)
    evidence = Evidence(
        feature_id=feature.id,
        attribute_key="step_count",
        value=0,
        label=EvidenceLabel.VERIFIED,
        source=EvidenceSource.AUDITOR,
        observer_id=auditor.id,
        verifier_id=verifier.id,
        observed_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=90),
        status=EvidenceStatus.APPROVED
    )
    db_session.add(evidence)
    db_session.flush()

    assert evidence.id is not None
    assert evidence.label == EvidenceLabel.VERIFIED
    assert evidence.observer_id != evidence.verifier_id


def test_audit_log_update_is_forbidden(db_session):
    """Proves that UPDATE on audit_log is strictly blocked by the database trigger."""
    user = create_test_user(db_session, role=UserRole.ADMIN)
    log = AuditLog(
        actor_id=user.id,
        action="initial_action",
        entity="place",
        entity_id=uuid.uuid4(),
        after={"name": "Before Update"}
    )
    db_session.add(log)
    db_session.flush()

    log.action = "tampered_action"
    with pytest.raises(Exception) as exc_info:
        db_session.flush()

    assert "audit_log is append-only" in str(exc_info.value)
    db_session.rollback()


def test_audit_log_delete_is_forbidden(db_session):
    """Proves that DELETE on audit_log is strictly blocked by the database trigger."""
    user = create_test_user(db_session, role=UserRole.ADMIN)
    log = AuditLog(
        actor_id=user.id,
        action="permanent_action",
        entity="place",
        entity_id=uuid.uuid4(),
        after={"name": "Immutable Record"}
    )
    db_session.add(log)
    db_session.flush()

    db_session.delete(log)
    with pytest.raises(Exception) as exc_info:
        db_session.flush()

    assert "audit_log is append-only" in str(exc_info.value)
    db_session.rollback()
