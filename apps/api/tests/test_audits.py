import uuid
from datetime import datetime, timezone, timedelta
from app.models.operations import UserRole, AuditLog
from app.models.accessibility import (
    FeatureType, EvidenceLabel, EvidenceSource, EvidenceStatus, AttributeDef, AttrValueType
)
from app.models.place import PlaceType
from tests.factories import (
    create_test_user, create_test_place, create_test_feature, create_test_evidence
)


def test_auth_login_and_me(client, db_session):
    """Test staff login returns JWT access token and /auth/me returns user details."""
    user = create_test_user(
        db_session,
        email="auditor_test@saarthi.test",
        role=UserRole.AUDITOR,
        password="ValidPassword123!"
    )
    db_session.commit()

    # 1. Successful login
    response = client.post(
        "/auth/login",
        json={"email": "auditor_test@saarthi.test", "password": "ValidPassword123!"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "auditor"
    assert data["email"] == "auditor_test@saarthi.test"

    token = data["access_token"]

    # 2. Authenticated /auth/me
    me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == "auditor_test@saarthi.test"
    assert me_data["role"] == "auditor"

    # 3. Invalid credentials
    bad_resp = client.post(
        "/auth/login",
        json={"email": "auditor_test@saarthi.test", "password": "WrongPassword"}
    )
    assert bad_resp.status_code == 401


def test_auditor_batch_sync_offline_queue(client, db_session):
    """Test auditor can batch sync offline audits and audit log is recorded."""
    auditor = create_test_user(db_session, role=UserRole.AUDITOR)
    place = create_test_place(db_session, name="Sancheti Hospital")
    feat = create_test_feature(db_session, place_id=place.id, feature_type=FeatureType.ENTRANCE)

    # Ensure attribute def exists
    attr_def = db_session.query(AttributeDef).filter(
        AttributeDef.feature_type == FeatureType.ENTRANCE,
        AttributeDef.key == "step_count"
    ).first()
    if not attr_def:
        attr_def = AttributeDef(
            feature_type=FeatureType.ENTRANCE,
            key="step_count",
            value_type=AttrValueType.NUMBER,
            description="Number of steps at entrance"
        )
        db_session.add(attr_def)
        db_session.flush()

    db_session.commit()

    # Login as auditor
    login_resp = client.post(
        "/auth/login",
        json={"email": auditor.email, "password": "SecurePass123!"}
    )
    token = login_resp.json()["access_token"]

    # Submit batch sync
    batch_payload = {
        "items": [
            {
                "feature_id": str(feat.id),
                "attribute_key": "step_count",
                "value": 0,
                "note": "Main ground entrance, zero steps, fully accessible ramp adjacent."
            }
        ]
    }

    resp = client.post(
        "/audits",
        json=batch_payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["synced_count"] == 1
    evidence_id = res_data["evidence_ids"][0]

    # Verify audit log was recorded
    log = db_session.query(AuditLog).filter(
        AuditLog.action == "audit_batch_item_created",
        AuditLog.entity_id == uuid.UUID(evidence_id)
    ).first()
    assert log is not None
    assert log.actor_id == auditor.id


def test_rule4_collector_cannot_verify_own_audit(client, db_session):
    """Rule 4: Collector is NOT verifier. An auditor cannot approve their own audit."""
    auditor = create_test_user(db_session, role=UserRole.ADMIN) # Admin has both roles
    place = create_test_place(db_session)
    feat = create_test_feature(db_session, place_id=place.id)

    # Create evidence collected by auditor
    evidence = create_test_evidence(
        db_session,
        feature_id=feat.id,
        observer_id=auditor.id,
        verifier_id=None,
        label=EvidenceLabel.REPORTED,
        status=EvidenceStatus.PENDING
    )
    db_session.commit()

    # Login as the same user who observed it
    login_resp = client.post(
        "/auth/login",
        json={"email": auditor.email, "password": "SecurePass123!"}
    )
    token = login_resp.json()["access_token"]

    # Attempt to self-approve
    approve_resp = client.post(
        f"/evidence/{evidence.id}/approve",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert approve_resp.status_code == 400
    assert "Collector cannot verify their own audit" in approve_resp.json()["detail"]


def test_second_person_verification_flow(client, db_session):
    """Test second user with verifier role can approve audit into 'verified' status."""
    auditor = create_test_user(db_session, email="auditor1@saarthi.test", role=UserRole.AUDITOR)
    verifier = create_test_user(db_session, email="verifier2@saarthi.test", role=UserRole.VERIFIER)
    place = create_test_place(db_session, name="PMC Health Clinic")
    feat = create_test_feature(db_session, place_id=place.id)

    evidence = create_test_evidence(
        db_session,
        feature_id=feat.id,
        observer_id=auditor.id,
        verifier_id=None,
        label=EvidenceLabel.REPORTED,
        status=EvidenceStatus.PENDING
    )
    db_session.commit()

    # Login as verifier
    login_resp = client.post(
        "/auth/login",
        json={"email": verifier.email, "password": "SecurePass123!"}
    )
    token = login_resp.json()["access_token"]

    # 1. Check verification queue
    queue_resp = client.get("/audits/verification-queue", headers={"Authorization": f"Bearer {token}"})
    assert queue_resp.status_code == 200
    queue = queue_resp.json()
    assert any(item["id"] == str(evidence.id) for item in queue)

    # 2. Approve evidence
    approve_resp = client.post(
        f"/evidence/{evidence.id}/approve",
        json={"note": "Photographic ramp slope measurements verified."},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert approve_resp.status_code == 200
    app_data = approve_resp.json()
    assert app_data["status"] == "approved"
    assert app_data["label"] == "verified"
    assert app_data["verifier_id"] == str(verifier.id)
    assert app_data["observer_id"] == str(auditor.id)

    # 3. Check audit log
    log = db_session.query(AuditLog).filter(
        AuditLog.action == "evidence_approved",
        AuditLog.entity_id == evidence.id
    ).first()
    assert log is not None
    assert log.actor_id == verifier.id


def test_reaudit_queue_detects_expired_evidence(client, db_session):
    """Test that expired evidence items automatically appear in the re-audit queue."""
    auditor = create_test_user(db_session, role=UserRole.AUDITOR)
    verifier = create_test_user(db_session, role=UserRole.VERIFIER)
    place = create_test_place(db_session, name="Swargate Bus Station")
    feat = create_test_feature(db_session, place_id=place.id, feature_type=FeatureType.LIFT)

    now = datetime.now(timezone.utc)
    # Expired 10 days ago
    evidence = create_test_evidence(
        db_session,
        feature_id=feat.id,
        observer_id=auditor.id,
        verifier_id=verifier.id,
        label=EvidenceLabel.VERIFIED,
        status=EvidenceStatus.APPROVED,
        observed_at=now - timedelta(days=100),
        expires_at=now - timedelta(days=10)
    )
    db_session.commit()

    login_resp = client.post(
        "/auth/login",
        json={"email": auditor.email, "password": "SecurePass123!"}
    )
    token = login_resp.json()["access_token"]

    queue_resp = client.get("/audits/reaudit-queue", headers={"Authorization": f"Bearer {token}"})
    assert queue_resp.status_code == 200
    items = queue_resp.json()
    assert len(items) > 0
    expired_item = next(i for i in items if i["feature_id"] == str(feat.id))
    assert expired_item["days_since_expiry"] >= 9
    assert expired_item["current_label"] == "unknown" # Strict rule: expired counts as unknown
