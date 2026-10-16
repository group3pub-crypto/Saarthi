import uuid
import json
from datetime import datetime, timezone
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
from geoalchemy2.functions import ST_X, ST_Y, ST_AsGeoJSON, ST_Distance, ST_SetSRID, ST_MakePoint

from app.models.place import Place
from app.models.routing import Segment
from app.models.accessibility import Feature, Evidence, NeedRule
from app.schemas.journey import JourneyPlanResponse, JourneyStepDetail, Coordinate
from app.services.readiness import (
    evaluate_journey,
    JourneyStep,
    NeedRuleDefinition,
    EvidenceRecord,
    JourneyVerdictStatus,
    StepStatus,
    DISCLAIMER_NOTICE
)


def find_nearest_node(db: Session, lat: float, lng: float) -> Optional[Tuple[int, float]]:
    """Find the nearest graph node (from_node or to_node) in the segment table to given coordinates."""
    sql = text("""
        SELECT 
            CASE 
                WHEN ST_Distance(ST_StartPoint(geom), ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)) < 
                     ST_Distance(ST_EndPoint(geom), ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
                THEN from_node
                ELSE to_node
            END AS nearest_node,
            ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS dist
        FROM segment
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
        LIMIT 1;
    """)
    result = db.execute(sql, {"lat": lat, "lng": lng}).fetchone()
    if result and result[0] is not None:
        return int(result[0]), float(result[1])
    return None


def get_pgrouting_path(db: Session, start_node: int, end_node: int) -> List[Dict[str, Any]]:
    """Execute pgr_dijkstra to find shortest pedestrian segment path between two nodes."""
    sql = text("""
        SELECT 
            p.seq, 
            p.node, 
            p.edge, 
            p.cost, 
            p.agg_cost,
            s.id AS segment_id,
            s.kind,
            s.length_m,
            ST_AsGeoJSON(s.geom) AS geojson
        FROM pgr_dijkstra(
            'SELECT gid AS id, from_node::bigint AS source, to_node::bigint AS target, cost::float8 AS cost, reverse_cost::float8 AS reverse_cost FROM segment',
            :start_node, :end_node, directed := false
        ) p
        LEFT JOIN segment s ON p.edge = s.gid
        ORDER BY p.seq;
    """)
    rows = db.execute(sql, {"start_node": start_node, "end_node": end_node}).fetchall()

    path_segments = []
    for r in rows:
        if r.edge > 0 and r.geojson:
            path_segments.append({
                "seq": r.seq,
                "node": r.node,
                "edge": r.edge,
                "segment_id": r.segment_id,
                "kind": r.kind,
                "length_m": r.length_m or 0.0,
                "geojson": json.loads(r.geojson)
            })
    return path_segments


def plan_accessible_journey(
    db: Session,
    origin: Coordinate,
    destination_place_id: uuid.UUID,
    needs: List[str],
    now: Optional[datetime] = None
) -> JourneyPlanResponse:
    """Plan a multimodal accessible journey combining pgRouting pathfinding and pure readiness evaluation."""
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    # 1. Fetch destination place
    place_row = db.query(
        Place.id,
        Place.name,
        Place.type,
        Place.address,
        Place.phone,
        ST_Y(Place.geom).label("lat"),
        ST_X(Place.geom).label("lng")
    ).filter(Place.id == destination_place_id).first()

    if not place_row:
        raise ValueError(f"Destination place with id '{destination_place_id}' not found.")

    dest_lat = float(place_row.lat)
    dest_lng = float(place_row.lng)

    # 2. Route pathfinding via pgRouting if segments exist
    start_node_info = find_nearest_node(db, origin.latitude, origin.longitude)
    dest_node_info = find_nearest_node(db, dest_lat, dest_lng)

    route_coordinates: List[List[float]] = [[origin.longitude, origin.latitude]]
    total_distance_m = 0.0
    journey_steps: List[JourneyStep] = []

    # If routing network is available, route along segments
    if start_node_info and dest_node_info:
        start_node, _ = start_node_info
        dest_node, _ = dest_node_info
        
        path_segments = get_pgrouting_path(db, start_node, dest_node)
        for idx, seg in enumerate(path_segments):
            seg_coords = seg["geojson"]["coordinates"]
            route_coordinates.extend(seg_coords)
            total_distance_m += seg["length_m"]

            step_id = f"seg-{seg['edge']}-{idx}"
            journey_steps.append(JourneyStep(
                step_id=step_id,
                feature_id=str(seg.get("segment_id") or seg["edge"]),
                feature_type=seg.get("kind", "footpath"),
                description=f"Follow {seg.get('kind', 'footpath')} ({int(seg['length_m'])}m)",
                floor_level=0,
                is_critical=True,
                destination_name=place_row.name,
                destination_phone=place_row.phone
            ))
    
    # Add final approach to place
    route_coordinates.append([dest_lng, dest_lat])

    # 3. Destination Internal Steps (Entrance -> Lift -> Counter, etc.)
    dest_features = db.query(Feature).filter(
        Feature.place_id == destination_place_id
    ).order_by(Feature.floor_level.asc(), Feature.name.asc()).all()

    if not dest_features:
        # Honest fallback: destination has no recorded entrance or internal features yet
        virtual_entrance_id = str(uuid.uuid5(destination_place_id, "entrance"))
        journey_steps.append(JourneyStep(
            step_id=f"dest-entrance-{destination_place_id}",
            feature_id=virtual_entrance_id,
            feature_type="entrance",
            description=f"Arrive at {place_row.name} entrance",
            floor_level=0,
            is_critical=True,
            destination_name=place_row.name,
            destination_phone=place_row.phone
        ))
    else:
        for f in dest_features:
            journey_steps.append(JourneyStep(
                step_id=f"dest-feat-{f.id}",
                feature_id=str(f.id),
                feature_type=f.type.value,
                description=f"{f.name} (Floor {f.floor_level})",
                floor_level=f.floor_level,
                is_critical=True,
                destination_name=place_row.name,
                destination_phone=place_row.phone
            ))

    # 4. Fetch Active Rules
    db_rules = db.query(NeedRule).filter(NeedRule.need_code.in_(needs)).all()
    pure_rules = [
        NeedRuleDefinition(
            need_code=r.need_code,
            feature_type=r.feature_type.value,
            attribute_key=r.attribute_key,
            operator=r.operator.value,
            threshold=r.threshold,
            critical=r.critical
        )
        for r in db_rules
    ]

    # 5. Fetch Evidence for all steps
    feature_id_strings = list({s.feature_id for s in journey_steps})
    valid_uuids = []
    for fid in feature_id_strings:
        try:
            valid_uuids.append(uuid.UUID(fid))
        except ValueError:
            pass

    evidence_by_feature: Dict[str, List[EvidenceRecord]] = {}
    if valid_uuids:
        db_ev = db.query(Evidence).filter(
            Evidence.feature_id.in_(valid_uuids),
            Evidence.status == "approved"
        ).all()
        for ev in db_ev:
            f_str = str(ev.feature_id)
            if f_str not in evidence_by_feature:
                evidence_by_feature[f_str] = []
            evidence_by_feature[f_str].append(EvidenceRecord(
                evidence_id=str(ev.id),
                feature_id=f_str,
                attribute_key=ev.attribute_key,
                value=ev.value,
                label=ev.label.value,
                source=ev.source.value,
                observed_at=ev.observed_at,
                expires_at=ev.expires_at,
                status=ev.status.value
            ))

    # 6. Execute Pure Readiness Engine
    verdict = evaluate_journey(
        steps=journey_steps,
        needs=needs,
        rules=pure_rules,
        evidence_by_feature=evidence_by_feature,
        now=now
    )

    # 7. Synthesize Response
    response_steps: List[JourneyStepDetail] = []
    all_fallback_actions = []

    for step, step_res in zip(journey_steps, verdict.step_results):
        formatted_actions = [
            {
                "action_type": a.action_type,
                "title": a.title,
                "detail": a.detail,
                "payload": a.payload
            }
            for a in step_res.next_actions
        ]
        all_fallback_actions.extend(formatted_actions)

        response_steps.append(JourneyStepDetail(
            step_id=step_res.step_id,
            feature_id=step_res.feature_id,
            feature_type=step_res.feature_type,
            description=step.description,
            floor_level=step.floor_level,
            is_critical=step.is_critical,
            status=step_res.status,
            label=step_res.label,
            source=step_res.source,
            observed_at=step_res.observed_at.isoformat() if step_res.observed_at else None,
            age_days=step_res.age_days,
            expires_at=step_res.expires_at.isoformat() if step_res.expires_at else None,
            reason=step_res.reason,
            next_actions=formatted_actions
        ))

    # Clean up duplicate actions
    unique_actions = []
    seen_titles = set()
    for act in all_fallback_actions:
        if act["title"] not in seen_titles:
            seen_titles.add(act["title"])
            unique_actions.append(act)

    route_geo = {
        "type": "LineString",
        "coordinates": route_coordinates
    }

    return JourneyPlanResponse(
        destination_name=place_row.name,
        destination_address=place_row.address,
        destination_phone=place_row.phone,
        total_distance_m=round(total_distance_m, 1),
        overall_status=verdict.status,
        confidence_score=verdict.confidence_score,
        summary_text=verdict.summary_text,
        limits_notice=verdict.limits_notice,
        active_needs=needs,
        route_geometry=route_geo,
        steps=response_steps,
        next_actions=unique_actions
    )
