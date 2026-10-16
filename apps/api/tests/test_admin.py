import uuid
from datetime import datetime, timezone, timedelta
from app.models.operations import UserRole, AuditLog, Escalation
from app.models.accessibility import (
    FeatureType, EvidenceLabel, EvidenceSource, EvidenceStatus, UserReport
)
from tests.factories import (
    create_test_user, create_test_place, create_test_feature, create_test_evidence
)


def test_public_coverage_endpoint(client, db_session):
    """Test public GET /coverage returns real stats across Pune open data."""
    place = create_test_place(db_session, name="Pune General Hospital")
    feat = create_test_feature(db_session, place_id=place.id)
    db_session.commit()

    resp = client.get("/coverage")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_places" in data
    assert "total_features" in data
    assert "coverage_pct" in data
    assert "by_place_type" in data


def test_admin_metrics_and_ledger(client, db_session):
    """Test admin metrics aggregation and append-only audit ledger retrieval."""
    admin = create_test_user(db_session, role=UserRole.ADMIN)
    auditor = create_test_user(db_session, role=UserRole.AUDITOR)
    db_session.commit()

    # Login as admin
    login_resp = client.post(
        "/auth/login",
        json={"email": admin.email, "password": "SecurePass123!"}
    )
    admin_token = login_resp.json()["access_token"]

    # 1. Check Metrics
    metrics_resp = client.get(
        "/admin/metrics",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert metrics_resp.status_code == 200
    metrics = metrics_resp.json()
    assert "total_places" in metrics
    assert "coverage_pct" in metrics

    # 2. Check Ledger
    ledger_resp = client.get(
        "/admin/ledger",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert ledger_resp.status_code == 200
    ledger = ledger_resp.json()
    assert len(ledger) > 0

    # 3. Non-admin forbidden
    auditor_login = client.post(
        "/auth/login",
        json={"email": auditor.email, "password": "SecurePass123!"}
    )
    auditor_token = auditor_login.json()["access_token"]
    forbidden_resp = client.get(
        "/admin/metrics",
        headers={"Authorization": f"Bearer {auditor_token}"}
    )
    assert forbidden_resp.status_code == 403


def test_admin_user_creation_and_audit_log(client, db_session):
    """Test admin can create new staff users and it writes to audit ledger."""
    admin = create_test_user(db_session, role=UserRole.ADMIN)
    db_session.commit()

    login_resp = client.post(
        "/auth/login",
        json={"email": admin.email, "password": "SecurePass123!"}
    )
    token = login_resp.json()["access_token"]

    new_email = f"new_verifier_{uuid.uuid4().hex[:6]}@saarthi.test"
    create_resp = client.post(
        "/admin/users",
        json={
            "email": new_email,
            "password": "VerifierPass123!",
            "role": "verifier"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert create_resp.status_code == 200
    data = create_resp.json()
    assert data["email"] == new_email
    assert data["role"] == "verifier"

    # Verify audit log was written
    log = db_session.query(AuditLog).filter(
        AuditLog.action == "user_account_created",
        AuditLog.entity_id == uuid.UUID(data["id"])
    ).first()
    assert log is not None
    assert log.actor_id == admin.id


def test_barrier_ledger_and_civic_escalation(client, db_session):
    """Test barrier ledger impact ranking and civic escalation workflow."""
    admin = create_test_user(db_session, role=UserRole.ADMIN)
    place = create_test_place(db_session, name="Shivajinagar District Court")
    feat = create_test_feature(db_session, place_id=place.id, feature_type=FeatureType.ENTRANCE)

    # Create barrier evidence
    barrier = create_test_evidence(
        db_session,
        feature_id=feat.id,
        attribute_key="step_count",
        value=14,
        label=EvidenceLabel.BARRIER,
        status=EvidenceStatus.APPROVED
    )
    db_session.commit()

    login_resp = client.post(
        "/auth/login",
        json={"email": admin.email, "password": "SecurePass123!"}
    )
    token = login_resp.json()["access_token"]

    # 1. View barrier ledger
    barrier_resp = client.get(
        "/admin/barrier-ledger",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert barrier_resp.status_code == 200
    barriers = barrier_resp.json()
    assert any(b["id"] == str(barrier.id) for b in barriers)

    # 2. Forward escalation to Civic Authority
    esc_resp = client.post(
        "/admin/escalations",
        json={
            "feature_id": str(feat.id),
            "evidence_id": str(barrier.id),
            "authority": "Pune Municipal Corporation - Public Works Department",
            "deadline_days": 21,
            "public_note": "Courthouse entrance has 14 steps with no ramp access."
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert esc_resp.status_code == 200
    esc_data = esc_resp.json()
    assert esc_data["authority"] == "Pune Municipal Corporation - Public Works Department"
    assert esc_data["public_status"] == "forwarded_to_authority"


def test_moderation_queue_and_resolution(client, db_session):
    """Test moderator can review citizen reports and resolve them into reported evidence."""
    moderator = create_test_user(db_session, role=UserRole.MODERATOR)
    place = create_test_place(db_session)
    feat = create_test_feature(db_session, place_id=place.id)

    # Create citizen report
    report = UserReport(
        feature_id=feat.id,
        attribute_key="step_count",
        value=5,
        anonymous_token="anon_token_12345",
        comment="Newly constructed concrete steps block wheelchair ramp.",
        status="open"
    )
    db_session.add(report)
    db_session.commit()

    login_resp = client.post(
        "/auth/login",
        json={"email": moderator.email, "password": "SecurePass123!"}
    )
    token = login_resp.json()["access_token"]

    # 1. Retrieve moderation queue
    queue_resp = client.get(
        "/admin/moderation/queue",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert queue_resp.status_code == 200
    reports = queue_resp.json()
    assert any(r["id"] == str(report.id) for r in reports)

    # 2. Resolve report
    resolve_resp = client.post(
        f"/admin/reports/{report.id}/resolve",
        json={"action": "promote_to_evidence", "note": "Verified by community photo"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "success"
