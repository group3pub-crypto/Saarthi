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


# ---------------------------------------------------------------------------
# Evidence summaries, evidence filters and own thresholds
# ---------------------------------------------------------------------------

def _add_evidence(db_session, feature, key, value, label, days_ago=3, expires_in_days=80, source=EvidenceSource.AUDITOR):
    now = datetime.now(timezone.utc)
    observer = create_test_user(db_session)
    verifier = create_test_user(db_session) if label == EvidenceLabel.VERIFIED else None
    return create_test_evidence(
        db_session, feature.id, key, value,
        label=label, source=source,
        observer_id=observer.id, verifier_id=verifier.id if verifier else None,
        observed_at=now - timedelta(days=days_ago),
        expires_at=now + timedelta(days=expires_in_days),
    )


def test_place_search_returns_evidence_summary_and_distance(client, db_session):
    place = create_test_place(db_session, name="Summary Test Clinic Alpha")
    entrance = create_test_feature(db_session, place.id, name="Front Entrance", feature_type=FeatureType.ENTRANCE)
    create_test_feature(db_session, place.id, name="Side Lift", feature_type=FeatureType.LIFT)
    _add_evidence(db_session, entrance, "step_count", 0, EvidenceLabel.VERIFIED)
    db_session.flush()

    res = client.get("/api/v1/places", params={"q": "Summary Test Clinic Alpha", "near": "18.5204,73.8567"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1

    evidence = data[0]["evidence"]
    assert evidence["state"] == "verified"
    assert evidence["feature_count"] == 2
    assert evidence["features_with_current_evidence"] == 1
    assert evidence["verified_count"] == 1
    assert evidence["barrier_count"] == 0
    assert evidence["last_observed_at"] is not None
    assert isinstance(data[0]["distance_m"], (int, float))


def test_place_search_without_evidence_is_unknown_not_accessible(client, db_session):
    create_test_place(db_session, name="Summary Test Clinic Beta")
    db_session.flush()

    res = client.get("/api/v1/places", params={"q": "Summary Test Clinic Beta"})
    assert res.status_code == 200
    data = res.json()

    assert data[0]["evidence"]["state"] == "unknown"
    assert data[0]["evidence"]["feature_count"] == 0
    assert data[0]["evidence"]["last_observed_at"] is None
    assert data[0]["distance_m"] is None


def test_place_search_filters_by_evidence_state_and_freshness(client, db_session):
    verified = create_test_place(db_session, name="Filter Test Verified Hub")
    barrier = create_test_place(db_session, name="Filter Test Barrier Hub")
    unknown = create_test_place(db_session, name="Filter Test Unknown Hub")
    reported = create_test_place(db_session, name="Filter Test Reported Hub")

    _add_evidence(
        db_session,
        create_test_feature(db_session, verified.id, name="Entrance", feature_type=FeatureType.ENTRANCE),
        "step_count", 0, EvidenceLabel.VERIFIED, days_ago=3,
    )
    _add_evidence(
        db_session,
        create_test_feature(db_session, barrier.id, name="Lift", feature_type=FeatureType.LIFT),
        "lift_working", False, EvidenceLabel.TEMPORARY_BARRIER, days_ago=0.5, expires_in_days=6,
    )
    create_test_feature(db_session, unknown.id, name="Entrance", feature_type=FeatureType.ENTRANCE)
    _add_evidence(
        db_session,
        create_test_feature(db_session, reported.id, name="Entrance", feature_type=FeatureType.ENTRANCE),
        "step_count", 0, EvidenceLabel.REPORTED, days_ago=2, expires_in_days=28, source=EvidenceSource.USER,
    )
    db_session.flush()

    def names(**params):
        res = client.get("/api/v1/places", params={"q": "Filter Test", **params})
        assert res.status_code == 200
        return sorted(p["name"] for p in res.json())

    assert names() == [
        "Filter Test Barrier Hub", "Filter Test Reported Hub",
        "Filter Test Unknown Hub", "Filter Test Verified Hub",
    ]
    assert names(evidence_state="verified") == ["Filter Test Verified Hub"]
    assert names(evidence_state="known_barrier") == ["Filter Test Barrier Hub"]
    assert names(evidence_state="reported") == ["Filter Test Reported Hub"]
    assert names(evidence_state="unknown") == ["Filter Test Unknown Hub"]

    # Freshness: the verified observation is 3 days old, the barrier 12 hours, the report 2 days
    assert names(fresh_days=1) == ["Filter Test Barrier Hub"]
    assert names(fresh_days=7) == [
        "Filter Test Barrier Hub", "Filter Test Reported Hub", "Filter Test Verified Hub",
    ]
    assert names(evidence_state="verified", fresh_days=2) == []


def test_place_search_rejects_unknown_evidence_state(client):
    res = client.get("/api/v1/places", params={"evidence_state": "accessible"})
    assert res.status_code == 422


def test_readiness_card_uses_own_door_width_threshold(client, db_session):
    place = create_test_place(db_session, name="Threshold Test Clinic")
    entrance = create_test_feature(db_session, place.id, name="Narrow Entrance", feature_type=FeatureType.ENTRANCE)
    _add_evidence(db_session, entrance, "step_count", 0, EvidenceLabel.VERIFIED)
    _add_evidence(db_session, entrance, "door_width_cm", 82, EvidenceLabel.VERIFIED)
    db_session.flush()

    standard = client.get(f"/api/v1/places/{place.id}/readiness-card", params={"needs": "step_free"}).json()
    assert standard["overall_status"] == "not_confirmed"
    assert standard["features"][0]["status"] == "barrier"
    assert standard["ignored_thresholds"] == []

    custom = client.get(
        f"/api/v1/places/{place.id}/readiness-card",
        params={"needs": "step_free", "min_door_width_cm": 80},
    ).json()
    assert custom["overall_status"] == "confirmed"

    door = next(
        r for r in custom["requirements"]
        if r["feature_type"] == "entrance" and r["attribute_key"] == "door_width_cm"
    )
    assert door["threshold"] == 80
    assert door["standard_threshold"] == 90
    assert door["custom"] is True


def test_readiness_card_rejects_out_of_range_threshold(client, db_session):
    place = create_test_place(db_session, name="Threshold Range Clinic")
    db_session.flush()

    res = client.get(
        f"/api/v1/places/{place.id}/readiness-card",
        params={"needs": "step_free", "max_ramp_slope_pct": 99},
    )
    assert res.status_code == 422


def test_readiness_card_never_confirms_needs_without_rules(client, db_session):
    place = create_test_place(db_session, name="Unruled Needs Clinic")
    entrance = create_test_feature(db_session, place.id, name="Entrance", feature_type=FeatureType.ENTRANCE)
    _add_evidence(db_session, entrance, "step_count", 0, EvidenceLabel.VERIFIED)
    db_session.flush()

    data = client.get(f"/api/v1/places/{place.id}/readiness-card", params={"needs": "cognitive"}).json()

    assert data["overall_status"] == "not_confirmed"
    assert data["unevaluated_needs"] == ["cognitive"]
    assert data["requirements"] == []
    assert data["features"][0]["applicable"] is False
    assert "accessible" not in data["summary_text"].lower()


def test_requirements_endpoint_lists_rules_and_unevaluated_needs(client):
    data = client.get("/api/v1/needs/requirements", params={"needs": "wheelchair,cognitive"}).json()

    assert data["unevaluated_needs"] == ["cognitive"]
    keys = {(r["feature_type"], r["attribute_key"]) for r in data["requirements"]}
    assert ("entrance", "step_count") in keys
    assert ("ramp", "slope_pct") in keys
    assert all(r["custom"] is False for r in data["requirements"])


def test_requirements_endpoint_applies_own_thresholds(client):
    data = client.get(
        "/api/v1/needs/requirements",
        params={"needs": "wheelchair", "min_door_width_cm": 80, "max_kerb_height_cm": 3},
    ).json()

    door = next(r for r in data["requirements"] if r["feature_type"] == "entrance" and r["attribute_key"] == "door_width_cm")
    assert door["threshold"] == 80 and door["standard_threshold"] == 90 and door["custom"] is True
    kerb = next(r for r in data["requirements"] if r["attribute_key"] == "kerb_height_cm")
    assert kerb["threshold"] == 3 and kerb["custom"] is True
    assert "custom_threshold" in data["active_needs"]


def test_requirements_endpoint_with_no_needs_is_empty(client):
    data = client.get("/api/v1/needs/requirements").json()

    assert data["requirements"] == []
    assert data["active_needs"] == []


def test_get_single_place_with_evidence_summary(client, db_session):
    place = create_test_place(db_session, name="Deep Link Clinic", place_type=PlaceType.HOSPITAL, lat=18.52, lng=73.85)
    db_session.flush()

    res = client.get(f"/api/v1/places/{place.id}")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Deep Link Clinic"
    assert body["evidence"]["state"] == "unknown"
    assert body["evidence"]["feature_count"] == 0


def test_get_single_place_not_found(client):
    res = client.get(f"/api/v1/places/{uuid.uuid4()}")
    assert res.status_code == 404
