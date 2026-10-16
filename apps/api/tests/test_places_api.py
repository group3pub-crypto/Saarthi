import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.models.place import PlaceType
from app.models.accessibility import FeatureType, EvidenceLabel, EvidenceSource, EvidenceStatus
from tests.factories import (
    create_test_place,
    create_test_feature,
    create_test_evidence,
    create_test_user
)


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_search_places(client, db_session):
    place1 = create_test_place(db_session, name="Sassoon General Hospital", place_type=PlaceType.HOSPITAL, lat=18.525, lng=73.875)
    place2 = create_test_place(db_session, name="Pune District Court", place_type=PlaceType.COURT, lat=18.520, lng=73.855)
    db_session.flush()

    # 1. Search all
    res = client.get("/api/v1/places")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "Sassoon General Hospital" in names
    assert "Pune District Court" in names

    # 2. Text filter
    res = client.get("/api/v1/places?q=Sassoon")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["name"] == "Sassoon General Hospital"

    # 3. Type filter
    res = client.get("/api/v1/places?type=court")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["type"] == "court"

    # 4. Proximity search (near Sassoon Hospital coordinates)
    res = client.get("/api/v1/places?near=18.525,73.875")
    assert res.status_code == 200
    # Closest must be first
    assert res.json()[0]["name"] == "Sassoon General Hospital"


def test_unaudited_place_returns_unknown_readiness(client, db_session):
    """An unaudited place must honestly return UNKNOWN and NOT_CONFIRMED."""
    place = create_test_place(db_session, name="Civil Hospital", phone="+91 20 2612 8000")
    feat = create_test_feature(db_session, place.id, name="Main Gate", feature_type=FeatureType.ENTRANCE)
    db_session.flush()

    res = client.get(f"/api/v1/places/{place.id}/readiness-card?needs=step_free")
    assert res.status_code == 200
    data = res.json()

    assert data["name"] == "Civil Hospital"
    assert data["overall_status"] == "not_confirmed"
    assert data["confidence_score"] == 0.0
    assert "accessible" not in data["summary_text"].lower()

    # Features must evaluate to UNKNOWN
    assert len(data["features"]) == 1
    feat_card = data["features"][0]
    assert feat_card["status"] == "unknown"
    assert "missing or expired" in feat_card["reason"].lower()
    
    # Must provide next actions (call helpdesk, call-ahead script)
    action_types = [a["action_type"] for a in feat_card["next_actions"]]
    assert "call_helpdesk" in action_types
    assert "call_ahead_script" in action_types


def test_audited_verified_place_returns_confirmed_readiness(client, db_session):
    """A place with current verified step-free evidence returns CONFIRMED."""
    place = create_test_place(db_session, name="Verified Health Center")
    feat = create_test_feature(db_session, place.id, name="Ramped Entrance", feature_type=FeatureType.ENTRANCE)
    auditor = create_test_user(db_session)
    verifier = create_test_user(db_session)
    now = datetime.now(timezone.utc)

    # Add verified step_count=0 and door_width_cm=100
    create_test_evidence(
        db_session, feat.id, "step_count", 0,
        label=EvidenceLabel.VERIFIED, source=EvidenceSource.AUDITOR,
        observer_id=auditor.id, verifier_id=verifier.id,
        observed_at=now - timedelta(days=2), expires_at=now + timedelta(days=88)
    )
    create_test_evidence(
        db_session, feat.id, "door_width_cm", 100,
        label=EvidenceLabel.VERIFIED, source=EvidenceSource.AUDITOR,
        observer_id=auditor.id, verifier_id=verifier.id,
        observed_at=now - timedelta(days=2), expires_at=now + timedelta(days=88)
    )
    db_session.flush()

    res = client.get(f"/api/v1/places/{place.id}/readiness-card?needs=step_free")
    assert res.status_code == 200
    data = res.json()

    assert data["overall_status"] == "confirmed"
    assert data["confidence_score"] == 1.0
    assert data["features"][0]["status"] == "verified"


def test_audited_barrier_place_returns_barrier_readiness(client, db_session):
    """A place with steps at entrance returns BARRIER."""
    place = create_test_place(db_session, name="Inaccessible Office")
    feat = create_test_feature(db_session, place.id, name="Stair Entrance", feature_type=FeatureType.ENTRANCE)
    auditor = create_test_user(db_session)
    verifier = create_test_user(db_session)
    now = datetime.now(timezone.utc)

    # 4 steps at entrance -> fails step_free requirement
    create_test_evidence(
        db_session, feat.id, "step_count", 4,
        label=EvidenceLabel.VERIFIED, source=EvidenceSource.AUDITOR,
        observer_id=auditor.id, verifier_id=verifier.id,
        observed_at=now - timedelta(days=2), expires_at=now + timedelta(days=88)
    )
    db_session.flush()

    res = client.get(f"/api/v1/places/{place.id}/readiness-card?needs=step_free")
    assert res.status_code == 200
    data = res.json()

    assert data["overall_status"] == "not_confirmed"
    assert data["features"][0]["status"] == "barrier"
    assert "violates requirement" in data["features"][0]["reason"].lower() or "barrier" in data["features"][0]["reason"].lower()


def test_nonexistent_place_returns_404(client):
    random_id = uuid.uuid4()
    res = client.get(f"/api/v1/places/{random_id}/readiness-card")
    assert res.status_code == 404
