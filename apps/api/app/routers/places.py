import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from geoalchemy2.functions import ST_X, ST_Y, ST_Distance, ST_SetSRID, ST_MakePoint

from app.database import get_db
from app.models.place import Place, PlaceType
from app.models.accessibility import Feature, Evidence, NeedRule
from app.schemas.place import PlaceSummaryResponse, PlaceReadinessCardResponse, FeatureReadinessCard
from app.services.readiness import (
    evaluate_journey,
    JourneyStep,
    NeedRuleDefinition,
    EvidenceRecord,
    DISCLAIMER_NOTICE
)

router = APIRouter(prefix="/api/v1/places", tags=["Places"])


@router.get("", response_model=List[PlaceSummaryResponse])
def search_places(
    q: Optional[str] = Query(None, description="Text search by name or address"),
    type: Optional[PlaceType] = Query(None, description="Filter by place type"),
    near: Optional[str] = Query(None, description="Proximity search in format 'lat,lng'"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Search public services with text query, type filters, and geographic proximity."""
    query = db.query(
        Place.id,
        Place.name,
        Place.type,
        Place.address,
        Place.department,
        Place.phone,
        Place.hours,
        Place.source,
        Place.ward_id,
        ST_Y(Place.geom).label("latitude"),
        ST_X(Place.geom).label("longitude"),
    )

    if q:
        search_filter = f"%{q.strip()}%"
        query = query.filter((Place.name.ilike(search_filter)) | (Place.address.ilike(search_filter)))

    if type:
        query = query.filter(Place.type == type)

    if near:
        try:
            lat_str, lng_str = near.split(",")
            lat = float(lat_str.strip())
            lng = float(lng_str.strip())
            point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
            query = query.order_by(ST_Distance(Place.geom, point))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid 'near' coordinate format. Expected 'latitude,longitude'"
            )
    else:
        query = query.order_by(Place.name.asc())

    results = query.offset(offset).limit(limit).all()

    response = []
    for row in results:
        response.append(PlaceSummaryResponse(
            id=row.id,
            name=row.name,
            type=row.type,
            address=row.address,
            latitude=row.latitude,
            longitude=row.longitude,
            department=row.department,
            phone=row.phone,
            hours=row.hours,
            source=row.source,
            ward_id=row.ward_id
        ))
    return response


@router.get("/{place_id}/readiness-card", response_model=PlaceReadinessCardResponse)
def get_place_readiness_card(
    place_id: uuid.UUID,
    needs: str = Query("step_free", description="Comma-separated list of active need codes (e.g. 'step_free,tactile')"),
    db: Session = Depends(get_db)
):
    """Retrieve the feature-by-feature accessibility readiness card for a specific place.

    Evaluated deterministically via the pure readiness engine.
    """
    place_query = db.query(
        Place.id,
        Place.name,
        Place.type,
        Place.address,
        Place.phone,
        ST_Y(Place.geom).label("latitude"),
        ST_X(Place.geom).label("longitude")
    ).filter(Place.id == place_id).first()

    if not place_query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id '{place_id}' not found."
        )

    need_codes = [n.strip() for n in needs.split(",") if n.strip()]
    if not need_codes:
        need_codes = ["step_free"]

    # Retrieve all features associated with this place
    features = db.query(Feature).filter(Feature.place_id == place_id).order_by(Feature.floor_level.asc(), Feature.name.asc()).all()

    # Convert features to JourneyStep objects
    steps: List[JourneyStep] = []
    for f in features:
        steps.append(JourneyStep(
            step_id=str(f.id),
            feature_id=str(f.id),
            feature_type=f.type.value,
            description=f.name,
            floor_level=f.floor_level,
            is_critical=True,
            destination_name=place_query.name,
            destination_phone=place_query.phone
        ))

    # Retrieve matching NeedRules from DB
    db_rules = db.query(NeedRule).filter(NeedRule.need_code.in_(need_codes)).all()
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

    # Retrieve evidence for these features
    feature_ids = [f.id for f in features]
    db_evidence = []
    if feature_ids:
        db_evidence = db.query(Evidence).filter(
            Evidence.feature_id.in_(feature_ids),
            Evidence.status == "approved"
        ).all()

    evidence_by_feature = {}
    for ev in db_evidence:
        f_id_str = str(ev.feature_id)
        if f_id_str not in evidence_by_feature:
            evidence_by_feature[f_id_str] = []
        evidence_by_feature[f_id_str].append(EvidenceRecord(
            evidence_id=str(ev.id),
            feature_id=f_id_str,
            attribute_key=ev.attribute_key,
            value=ev.value,
            label=ev.label.value,
            source=ev.source.value,
            observed_at=ev.observed_at,
            expires_at=ev.expires_at,
            status=ev.status.value
        ))

    now = datetime.now(timezone.utc)
    verdict = evaluate_journey(
        steps=steps,
        needs=need_codes,
        rules=pure_rules,
        evidence_by_feature=evidence_by_feature,
        now=now
    )

    feature_cards = []
    for step_res in verdict.step_results:
        feature_cards.append(FeatureReadinessCard(
            feature_id=uuid.UUID(step_res.feature_id),
            feature_type=step_res.feature_type,
            feature_name=next((s.description for s in steps if s.step_id == step_res.step_id), step_res.feature_type),
            floor_level=next((s.floor_level for s in steps if s.step_id == step_res.step_id), 0),
            status=step_res.status,
            label=step_res.label,
            source=step_res.source,
            observed_at=step_res.observed_at,
            age_days=step_res.age_days,
            expires_at=step_res.expires_at,
            reason=step_res.reason,
            next_actions=[
                {
                    "action_type": a.action_type,
                    "title": a.title,
                    "detail": a.detail,
                    "payload": a.payload
                }
                for a in step_res.next_actions
            ]
        ))

    return PlaceReadinessCardResponse(
        place_id=place_query.id,
        name=place_query.name,
        type=place_query.type,
        address=place_query.address,
        latitude=place_query.latitude,
        longitude=place_query.longitude,
        phone=place_query.phone,
        overall_status=verdict.status,
        confidence_score=verdict.confidence_score,
        active_needs=need_codes,
        features=feature_cards,
        summary_text=verdict.summary_text,
        limits_notice=verdict.limits_notice
    )
