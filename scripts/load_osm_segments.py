"""
SAARTHI Access - OSM Pedestrian Segments Loader
Loads real pedestrian paths, footways, crossings, steps, and ramps from OSM GeoJSON into the `segment` table,
builds pgRouting topology with shared node IDs, and maps real OSM accessibility tags (kerb, tactile_paving, incline, width)
to `Feature` and `Evidence` with source='osm', label='reported', and 30-day expiry.
Missing tags remain unrecorded so they evaluate strictly to Unknown.
"""

import sys
import math
import json
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Tuple, List, Optional
from shapely.geometry import shape, LineString
from geoalchemy2.shape import from_shape

# Ensure apps/api is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from app.database import SessionLocal
from app.models.routing import Segment, SegmentKind
from app.models.accessibility import (
    Feature, FeatureType, Evidence, EvidenceLabel,
    EvidenceSource, EvidenceStatus
)


def haversine_distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """Calculate distance between two (lon, lat) points in meters."""
    lon1, lat1 = map(math.radians, p1)
    lon2, lat2 = map(math.radians, p2)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.asin(math.sqrt(a))
    return c * 6371000.0  # Earth radius in meters


def calculate_linestring_length(coords: List[Tuple[float, float]]) -> float:
    """Compute total length of a linestring in meters."""
    if len(coords) < 2:
        return 0.0
    return sum(haversine_distance(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def determine_segment_kind(props: Dict[str, str]) -> SegmentKind:
    """Classify segment kind from OSM highway and ramp tags."""
    highway = props.get("highway", "")
    ramp = props.get("ramp", "")

    if highway == "steps":
        return SegmentKind.STAIRS
    elif ramp == "yes" or highway == "ramp":
        return SegmentKind.RAMP
    elif highway == "crossing":
        return SegmentKind.CROSSING
    else:
        return SegmentKind.FOOTPATH


def load_pedestrian_segments(geojson_path: Path, db) -> Dict[str, int]:
    """
    Parse GeoJSON and populate segment, feature, and evidence tables.
    """
    if not geojson_path.exists():
        raise FileNotFoundError(f"Pedestrian GeoJSON file not found at: {geojson_path}")

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise ValueError(f"Malformed GeoJSON at '{geojson_path}': {e}") from e

    features = data.get("features", [])
    print(f"[*] Processing {len(features)} pedestrian features from {geojson_path.name}...")

    # Preload existing OSM way IDs for idempotency
    existing_ways = {
        row[0] for row in db.query(Segment.osm_way_id).filter(Segment.osm_way_id.isnot(None)).all()
    }

    # Node mapping: quantized (lon, lat) -> integer node ID
    node_map: Dict[Tuple[float, float], int] = {}
    
    # Query highest existing node ID from database if any segments exist
    max_node = db.query(Segment.from_node).union(db.query(Segment.to_node)).order_by(Segment.from_node.desc()).first()
    next_node_id = (max_node[0] + 1) if (max_node and max_node[0]) else 1

    stats = {
        "segments_added": 0,
        "segments_skipped_existing": 0,
        "features_created": 0,
        "evidence_created": 0,
    }

    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=30)  # Standard 30-day expiry for reported OSM evidence

    batch_segments = []
    batch_features = []
    batch_evidence = []
    batch_size = 500

    for feat in features:
        geom_dict = feat.get("geometry")
        props = feat.get("properties", {})

        if not geom_dict or geom_dict.get("type") != "LineString":
            continue

        raw_coords = geom_dict.get("coordinates", [])
        if len(raw_coords) < 2:
            continue

        coords = [(float(c[0]), float(c[1])) for c in raw_coords]

        # Extract OSM Way ID
        raw_id = props.get("@id") or feat.get("id")
        osm_way_id: Optional[int] = None
        if raw_id:
            cleaned = str(raw_id).lstrip("nwr")
            try:
                osm_way_id = int(cleaned)
            except ValueError:
                pass

        # Idempotency check
        if osm_way_id and osm_way_id in existing_ways:
            stats["segments_skipped_existing"] += 1
            continue

        # Topological node assignment (quantized to 5 decimal places ~ 1 meter)
        start_pt = (round(coords[0][0], 5), round(coords[0][1], 5))
        end_pt = (round(coords[-1][0], 5), round(coords[-1][1], 5))

        if start_pt not in node_map:
            node_map[start_pt] = next_node_id
            next_node_id += 1
        from_node = node_map[start_pt]

        if end_pt not in node_map:
            node_map[end_pt] = next_node_id
            next_node_id += 1
        to_node = node_map[end_pt]

        # Length and cost
        length_m = max(1.0, calculate_linestring_length(coords))
        kind = determine_segment_kind(props)

        # Stairs have higher traversal cost for pedestrians
        cost_multiplier = 3.0 if kind == SegmentKind.STAIRS else 1.0
        cost = length_m * cost_multiplier
        reverse_cost = cost  # Two-way pedestrian routing

        line_geom = LineString(coords)
        wkt_geom = from_shape(line_geom, srid=4326)

        segment = Segment(
            kind=kind,
            geom=wkt_geom,
            from_node=from_node,
            to_node=to_node,
            osm_way_id=osm_way_id,
            length_m=round(length_m, 2),
            cost=round(cost, 2),
            reverse_cost=round(reverse_cost, 2)
        )
        batch_segments.append((segment, props))
        if osm_way_id:
            existing_ways.add(osm_way_id)
        stats["segments_added"] += 1

        if len(batch_segments) >= batch_size:
            _flush_batch(batch_segments, db, now, expiry, stats)
            batch_segments.clear()
            print(f"  ...imported {stats['segments_added']} segments so far")

    if batch_segments:
        _flush_batch(batch_segments, db, now, expiry, stats)
        batch_segments.clear()

    print(f"[+] OSM Segments import complete: {stats['segments_added']} added, "
          f"{stats['segments_skipped_existing']} existing skipped.")
    print(f"    Accessibility features: {stats['features_created']}, evidence records: {stats['evidence_created']}")
    return stats


def _flush_batch(batch_segments, db, now, expiry, stats):
    """Save batch of segments and their associated accessibility features and evidence."""
    for seg, props in batch_segments:
        db.add(seg)
        db.flush()  # To populate seg.id

        # Check for real OSM accessibility tags
        # 1. Kerb
        kerb_val = props.get("kerb")
        if kerb_val in ["raised", "lowered", "flush", "rolled"]:
            kerb_feat = Feature(
                segment_id=seg.id,
                type=FeatureType.KERB,
                name=f"Kerb ({kerb_val})"
            )
            db.add(kerb_feat)
            db.flush()
            stats["features_created"] += 1

            ev = Evidence(
                feature_id=kerb_feat.id,
                attribute_key="kerb_type",
                value={"value": kerb_val},
                label=EvidenceLabel.REPORTED,
                source=EvidenceSource.OSM,
                observed_at=now,
                expires_at=expiry,
                status=EvidenceStatus.APPROVED,
                note="Imported from OpenStreetMap kerb tag"
            )
            db.add(ev)
            stats["evidence_created"] += 1

        # 2. Tactile Paving
        tactile_val = props.get("tactile_paving")
        if tactile_val in ["yes", "no"]:
            tactile_feat = Feature(
                segment_id=seg.id,
                type=FeatureType.TACTILE_PATH,
                name="Tactile Paving"
            )
            db.add(tactile_feat)
            db.flush()
            stats["features_created"] += 1

            ev = Evidence(
                feature_id=tactile_feat.id,
                attribute_key="tactile_path",
                value={"value": (tactile_val == "yes")},
                label=EvidenceLabel.REPORTED,
                source=EvidenceSource.OSM,
                observed_at=now,
                expires_at=expiry,
                status=EvidenceStatus.APPROVED,
                note="Imported from OpenStreetMap tactile_paving tag"
            )
            db.add(ev)
            stats["evidence_created"] += 1

        # 3. Incline
        incline_val = props.get("incline")
        if incline_val:
            try:
                # e.g. "5%" or "0.05"
                incline_num = float(incline_val.rstrip("%"))
                ramp_feat = Feature(
                    segment_id=seg.id,
                    type=FeatureType.RAMP if seg.kind == SegmentKind.RAMP else FeatureType.ENTRANCE,
                    name="Incline / Slope"
                )
                db.add(ramp_feat)
                db.flush()
                stats["features_created"] += 1

                ev = Evidence(
                    feature_id=ramp_feat.id,
                    attribute_key="incline_pct",
                    value={"value": incline_num},
                    label=EvidenceLabel.REPORTED,
                    source=EvidenceSource.OSM,
                    observed_at=now,
                    expires_at=expiry,
                    status=EvidenceStatus.APPROVED,
                    note=f"Imported from OpenStreetMap incline tag ({incline_val})"
                )
                db.add(ev)
                stats["evidence_created"] += 1
            except ValueError:
                pass

        # 4. Width
        width_val = props.get("width")
        if width_val:
            try:
                width_m = float(width_val.split()[0].rstrip("m"))
                width_cm = width_m * 100.0
                feat = Feature(
                    segment_id=seg.id,
                    type=FeatureType.ENTRANCE,
                    name="Clear Width"
                )
                db.add(feat)
                db.flush()
                stats["features_created"] += 1

                ev = Evidence(
                    feature_id=feat.id,
                    attribute_key="footpath_clear_width_cm",
                    value={"value": width_cm},
                    label=EvidenceLabel.REPORTED,
                    source=EvidenceSource.OSM,
                    observed_at=now,
                    expires_at=expiry,
                    status=EvidenceStatus.APPROVED,
                    note=f"Imported from OpenStreetMap width tag ({width_val})"
                )
                db.add(ev)
                stats["evidence_created"] += 1
            except ValueError:
                pass

    db.commit()


def main():
    parser = argparse.ArgumentParser(description="Load real OSM pedestrian segments into pgRouting graph")
    parser.add_argument("--file", type=str, default="data/raw/pune_pedestrian.geojson", help="Path to pedestrian GeoJSON")
    args = parser.parse_args()

    geojson_path = Path(args.file)
    db = SessionLocal()
    try:
        load_pedestrian_segments(geojson_path, db)
        print("[SUCCESS] Pedestrian segments loaded and pgRouting topology constructed successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
