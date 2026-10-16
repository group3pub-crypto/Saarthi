import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.models.place import PlaceType
from app.models.routing import Segment, SegmentKind
from app.models.accessibility import FeatureType, EvidenceLabel, EvidenceSource
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


def test_journey_plan_unaudited_place_returns_not_confirmed(client, db_session):
    """An unaudited destination must return not_confirmed and honest unknown status."""
    place = create_test_place(db_session, name="District Hospital", phone="+91 20 2612 0000", lat=18.520, lng=73.856)
    db_session.flush()

    payload = {
        "origin": {"latitude": 18.518, "longitude": 73.850},
        "destination_place_id": str(place.id),
        "needs": ["step_free"]
    }

    res = client.post("/api/v1/journeys/plan", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["destination_name"] == "District Hospital"
    assert data["overall_status"] == "not_confirmed"
    assert data["confidence_score"] == 0.0
    assert "accessible" not in data["summary_text"].lower()

    # Steps must contain the entrance evaluated to UNKNOWN
    assert len(data["steps"]) >= 1
    entrance_step = data["steps"][-1]
    assert entrance_step["status"] == "unknown"

    # Next actions must offer call-ahead script & helpdesk
    action_types = [a["action_type"] for a in data["next_actions"]]
    assert "call_helpdesk" in action_types
    assert "call_ahead_script" in action_types


def test_journey_plan_with_pgrouting_network(client, db_session):
    """Test pathfinding over pedestrian segments using pgRouting."""
    # Create 2 segments: Node 100 -> Node 101 -> Node 102
    seg1 = Segment(
        kind=SegmentKind.FOOTPATH,
        geom="SRID=4326;LINESTRING(73.850 18.518, 73.853 18.519)",
        from_node=100,
        to_node=101,
        length_m=350.0,
        cost=350.0,
        reverse_cost=350.0
    )
    seg2 = Segment(
        kind=SegmentKind.FOOTPATH,
        geom="SRID=4326;LINESTRING(73.853 18.519, 73.856 18.520)",
        from_node=101,
        to_node=102,
        length_m=340.0,
        cost=340.0,
        reverse_cost=340.0
    )
    place = create_test_place(db_session, name="Aadhaar Kendra", lat=18.520, lng=73.856)
    feat = create_test_feature(db_session, place.id, name="Kendra Entrance", feature_type=FeatureType.ENTRANCE)
    db_session.add_all([seg1, seg2])
    db_session.flush()

    payload = {
        "origin": {"latitude": 18.518, "longitude": 73.850},
        "destination_place_id": str(place.id),
        "needs": ["step_free"]
    }

    res = client.post("/api/v1/journeys/plan", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["total_distance_m"] >= 690.0
    assert len(data["route_geometry"]["coordinates"]) >= 4
    assert len(data["steps"]) >= 3


def test_step_free_plus_unknown_lift_never_confirmed(client, db_session):
    """CRITICAL INVARIANT: Step-free need + unknown lift never yields a confirmed journey."""
    place = create_test_place(db_session, name="Multi-storey Civil Hospital", lat=18.520, lng=73.856)
    entrance = create_test_feature(db_session, place.id, name="Ground Entrance", feature_type=FeatureType.ENTRANCE)
    lift = create_test_feature(db_session, place.id, name="Registration Lift", feature_type=FeatureType.LIFT, floor_level=0)
    auditor = create_test_user(db_session)
    verifier = create_test_user(db_session)
    now = datetime.now(timezone.utc)

    # Entrance is fully verified step_free
    create_test_evidence(
        db_session, entrance.id, "step_count", 0,
        label=EvidenceLabel.VERIFIED, source=EvidenceSource.AUDITOR,
        observer_id=auditor.id, verifier_id=verifier.id,
        observed_at=now - timedelta(days=5), expires_at=now + timedelta(days=85)
    )
    create_test_evidence(
        db_session, entrance.id, "door_width_cm", 95,
        label=EvidenceLabel.VERIFIED, source=EvidenceSource.AUDITOR,
        observer_id=auditor.id, verifier_id=verifier.id,
        observed_at=now - timedelta(days=5), expires_at=now + timedelta(days=85)
    )
    # LIFT HAS ZERO EVIDENCE (UNKNOWN)
    db_session.flush()

    payload = {
        "origin": {"latitude": 18.518, "longitude": 73.850},
        "destination_place_id": str(place.id),
        "needs": ["step_free"]
    }

    res = client.post("/api/v1/journeys/plan", json=payload)
    assert res.status_code == 200
    data = res.json()

    # MUST NEVER BE CONFIRMED ACCESSIBLE
    assert data["overall_status"] == "not_confirmed"
    assert "accessible" not in data["summary_text"].lower()

    # Find the lift step
    lift_step = next(s for s in data["steps"] if s["feature_type"] == "lift")
    assert lift_step["status"] == "unknown"


def test_journey_confirmed_when_all_critical_steps_verified(client, db_session):
    """When every step is verified, overall verdict is confirmed with 1.0 confidence."""
    place = create_test_place(db_session, name="Accessible Clinic", lat=18.520, lng=73.856)
    entrance = create_test_feature(db_session, place.id, name="Main Entrance", feature_type=FeatureType.ENTRANCE)
    auditor = create_test_user(db_session)
    verifier = create_test_user(db_session)
    now = datetime.now(timezone.utc)

    create_test_evidence(
        db_session, entrance.id, "step_count", 0,
        label=EvidenceLabel.VERIFIED, source=EvidenceSource.AUDITOR,
        observer_id=auditor.id, verifier_id=verifier.id,
        observed_at=now - timedelta(days=5), expires_at=now + timedelta(days=85)
    )
    create_test_evidence(
        db_session, entrance.id, "door_width_cm", 100,
        label=EvidenceLabel.VERIFIED, source=EvidenceSource.AUDITOR,
        observer_id=auditor.id, verifier_id=verifier.id,
        observed_at=now - timedelta(days=5), expires_at=now + timedelta(days=85)
    )
    db_session.flush()

    payload = {
        "origin": {"latitude": 18.518, "longitude": 73.850},
        "destination_place_id": str(place.id),
        "needs": ["step_free"]
    }

    res = client.post("/api/v1/journeys/plan", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["overall_status"] == "confirmed"
    assert data["confidence_score"] == 1.0
    assert "confirmed" in data["summary_text"].lower()
