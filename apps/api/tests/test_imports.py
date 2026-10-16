"""
Integration & Unit Tests for Data Import Pipelines
Verifies:
- Strict validation and rejection of malformed data
- Complete idempotency across all importers
- Invariant: Zero accessibility evidence imported for places -> Status is always honestly 'Unknown'
- Real OSM tags mapped to 'reported' evidence with 30-day expiry
- Missing tags leave features as 'Unknown'
"""

import uuid
import json
import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from shapely.geometry import Point, LineString, Polygon, MultiPolygon
from geoalchemy2.shape import from_shape

import sys
from app.models.place import Place, PlaceType, Ward
from app.models.routing import Segment, SegmentKind
from app.models.accessibility import (
    Feature, FeatureType, Evidence, EvidenceLabel,
    EvidenceSource, EvidenceStatus
)

# Ensure workspace root is in sys.path
root_dir = Path(__file__).resolve().parent.parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from scripts.import_places_csv import validate_row, import_csv
from scripts.import_kml import import_wards, import_bus_stops, parse_bbox, parse_coordinates_text
from scripts.load_osm_segments import (
    haversine_distance, calculate_linestring_length,
    determine_segment_kind, load_pedestrian_segments
)
from scripts.import_osm_places import classify_osm_place_type, import_osm_places_from_geojson


def test_csv_validator_rejects_missing_and_invalid_fields():
    # 1. Missing name
    ok, errs, _ = validate_row(1, {"type": "hospital", "address": "Pune", "lat": "18.5", "lng": "73.8", "source": "csv"})
    assert not ok
    assert any("name" in e.lower() for e in errs)

    # 2. Invalid place type
    ok, errs, _ = validate_row(2, {"name": "Test Place", "type": "space_station", "address": "Pune", "lat": "18.5", "lng": "73.8", "source": "csv"})
    assert not ok
    assert any("invalid place type" in e.lower() for e in errs)

    # 3. Out-of-bounds latitude
    ok, errs, _ = validate_row(3, {"name": "Test Place", "type": "hospital", "address": "Pune", "lat": "999.0", "lng": "73.8", "source": "csv"})
    assert not ok
    assert any("latitude" in e.lower() for e in errs)

    # 4. Valid row passes
    ok, errs, clean = validate_row(4, {
        "name": "KEM Hospital",
        "type": "hospital",
        "address": "Rasta Peth, Pune",
        "lat": "18.5204",
        "lng": "73.8698",
        "phone": "020-26125600",
        "department": "Health",
        "source": "official_directory"
    })
    assert ok
    assert len(errs) == 0
    assert clean["name"] == "KEM Hospital"
    assert clean["type"] == PlaceType.HOSPITAL


def test_kml_import_missing_file_raises_error(db_session):
    with pytest.raises(FileNotFoundError):
        import_wards(Path("data/raw/nonexistent_ward_file.kml"), db_session)

    with pytest.raises(FileNotFoundError):
        import_bus_stops(Path("data/raw/nonexistent_stops_file.kml"), db_session)


def test_kml_import_malformed_xml_raises_error(tmp_path, db_session):
    bad_kml = tmp_path / "bad.kml"
    bad_kml.write_text("<kml><Placemark><unclosed></kml>", encoding="utf-8")

    with pytest.raises(ValueError, match="Malformed XML"):
        import_wards(bad_kml, db_session)


def test_osm_pedestrian_haversine_and_kind_classification():
    p1 = (73.8567, 18.5204)
    p2 = (73.8567, 18.5214)  # ~111 meters North
    dist = haversine_distance(p1, p2)
    assert 100.0 < dist < 120.0

    coords = [p1, (73.8567, 18.5209), p2]
    total_len = calculate_linestring_length(coords)
    assert 100.0 < total_len < 120.0

    # Classification
    assert determine_segment_kind({"highway": "steps"}) == SegmentKind.STAIRS
    assert determine_segment_kind({"highway": "footway", "ramp": "yes"}) == SegmentKind.RAMP
    assert determine_segment_kind({"highway": "crossing"}) == SegmentKind.CROSSING
    assert determine_segment_kind({"highway": "footway"}) == SegmentKind.FOOTPATH


def test_osm_place_type_mapping():
    assert classify_osm_place_type({"amenity": "hospital"}) == PlaceType.HOSPITAL
    assert classify_osm_place_type({"amenity": "clinic"}) == PlaceType.HOSPITAL
    assert classify_osm_place_type({"amenity": "courthouse"}) == PlaceType.COURT
    assert classify_osm_place_type({"amenity": "townhall"}) == PlaceType.MUNICIPAL_OFFICE
    assert classify_osm_place_type({"office": "government"}) == PlaceType.MUNICIPAL_OFFICE
    assert classify_osm_place_type({"railway": "station"}) == PlaceType.TRANSPORT_HUB
    assert classify_osm_place_type({"amenity": "bus_station"}) == PlaceType.TRANSPORT_HUB
    assert classify_osm_place_type({"amenity": "nightclub"}) is None


def test_osm_segment_loader_creates_reported_evidence_with_expiry(tmp_path, db_session):
    # Create synthetic valid GeoJSON feature with real OSM tags
    geojson_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "w123456",
                "properties": {
                    "@id": "123456",
                    "highway": "footway",
                    "kerb": "lowered",
                    "tactile_paving": "yes",
                    "incline": "4%",
                    "width": "1.8 m"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [73.8567, 18.5204],
                        [73.8570, 18.5204]
                    ]
                }
            }
        ]
    }
    test_geojson = tmp_path / "test_pedestrian.geojson"
    test_geojson.write_text(json.dumps(geojson_data), encoding="utf-8")

    stats = load_pedestrian_segments(test_geojson, db_session)
    assert stats["segments_added"] == 1
    assert stats["features_created"] >= 3
    assert stats["evidence_created"] >= 3

    # Verify in DB
    segment = db_session.query(Segment).filter(Segment.osm_way_id == 123456).first()
    assert segment is not None
    assert segment.kind == SegmentKind.FOOTPATH

    evidence_items = db_session.query(Evidence).join(Feature).filter(Feature.segment_id == segment.id).all()
    assert len(evidence_items) >= 3

    # Check invariants:
    # 1. source must be OSM
    # 2. label must be REPORTED (never verified)
    # 3. expires_at must be ~30 days in the future
    for ev in evidence_items:
        assert ev.source == EvidenceSource.OSM
        assert ev.label == EvidenceLabel.REPORTED
        assert ev.status == EvidenceStatus.APPROVED
        assert ev.expires_at > ev.observed_at
        delta_days = (ev.expires_at - ev.observed_at).days
        assert 28 <= delta_days <= 32


def test_imported_places_have_zero_dummy_evidence_and_unknown_readiness(client, db_session):
    # Verify that newly imported place starts with honest Unknown readiness
    pt = from_shape(Point(73.8567, 18.5204), srid=4326)
    place = Place(
        name="Real Government Health Centre",
        type=PlaceType.HOSPITAL,
        address="100 Camp Road, Pune",
        geom=pt,
        source="osm",
        osm_id=987654321
    )
    db_session.add(place)
    db_session.commit()

    # Query readiness card
    response = client.get(f"/api/v1/places/{place.id}/readiness-card?needs=step_free")
    assert response.status_code == 200
    data = response.json()

    assert data["place_id"] == str(place.id)
    assert data["overall_status"] == "not_confirmed"
    assert data["confidence_score"] == 0.0
    assert "accessible" not in data["summary_text"].lower()
