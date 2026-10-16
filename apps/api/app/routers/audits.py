import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from geoalchemy2.functions import ST_X, ST_Y

from app.database import get_db
from app.models.accessibility import (
    Feature, AttributeDef, Evidence, NeedRule,
    EvidenceLabel, EvidenceSource, EvidenceStatus
)
from app.models.place import Place
from app.models.operations import UserAccount, UserRole
from app.core.permissions import get_current_user, require_roles
from app.core.audit import record_audit_log
from app.schemas.audit import (
    AttributeDefOut, AuditBatchSyncRequest, AuditBatchSyncResponse,
    EvidenceOut, EvidenceActionRequest, AuditAssignmentOut, ReauditQueueItemOut
)

router = APIRouter(prefix="", tags=["Audits & Verification Workflow"])


@router.get("/attribute-defs", response_model=List[AttributeDefOut])
def get_attribute_definitions(
    feature_type: Optional[str] = Query(None, description="Filter by feature type"),
    db: Session = Depends(get_db)
):
    """Retrieve attribute definitions for feature audit forms and measurements."""
    query = db.query(AttributeDef)
    if feature_type:
        query = query.filter(AttributeDef.feature_type == feature_type)
    return query.order_by(AttributeDef.feature_type, AttributeDef.key).all()


@router.get("/audits/assignments", response_model=List[AuditAssignmentOut])
def get_audit_assignments(
    limit: int = Query(25, ge=1, le=100),
    place_type: Optional[str] = Query(None),
    current_user: UserAccount = Depends(require_roles([UserRole.AUDITOR, UserRole.ADMIN, UserRole.VERIFIER])),
    db: Session = Depends(get_db)
):
    """Retrieve public places requiring accessibility field audits."""
    query = db.query(
        Place.id,
        Place.name,
        Place.type,
        Place.address,
        Place.department,
        ST_X(Place.geom).label("lng"),
        ST_Y(Place.geom).label("lat")
    )
    if place_type:
        query = query.filter(Place.type == place_type)

    places = query.limit(limit).all()

    assignments = []
    now = datetime.now(timezone.utc)
    for p in places:
        # Count features and unverified features
        features = db.query(Feature).filter(Feature.place_id == p.id).all()
        total_feats = len(features)

        unverified = 0
        for f in features:
            valid_evidence = db.query(Evidence).filter(
                Evidence.feature_id == f.id,
                Evidence.status == EvidenceStatus.APPROVED,
                Evidence.expires_at > now,
                Evidence.label == EvidenceLabel.VERIFIED
            ).first()
            if not valid_evidence:
                unverified += 1

        # Priority calculation: hospitals and transport hubs have higher base priority
        base_priority = 3.0 if p.type in ["hospital", "transport_hub"] else 1.5
        priority_score = base_priority + (unverified * 0.5)

        assignments.append(
            AuditAssignmentOut(
                place_id=p.id,
                place_name=p.name,
                place_type=p.type,
                address=p.address or "Pune, Maharashtra",
                department=p.department,
                latitude=p.lat or 18.5204,
                longitude=p.lng or 73.8567,
                total_features=total_feats,
                unverified_features=unverified,
                priority_score=round(priority_score, 2)
            )
        )

    # Sort by priority score descending
    assignments.sort(key=lambda a: a.priority_score, reverse=True)
    return assignments


@router.post("/audits", response_model=AuditBatchSyncResponse)
def sync_audits_batch(
    payload: AuditBatchSyncRequest,
    current_user: UserAccount = Depends(require_roles([UserRole.AUDITOR, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Batch upload offline audit submissions from auditor PWA."""
    now = datetime.now(timezone.utc)
    synced_ids = []
    errors = []

    for idx, item in enumerate(payload.items):
        feature = db.query(Feature).filter(Feature.id == item.feature_id).first()
        if not feature:
            errors.append(f"Item #{idx}: Feature ID {item.feature_id} not found")
            continue

        attr_def = db.query(AttributeDef).filter(
            AttributeDef.feature_type == feature.type,
            AttributeDef.key == item.attribute_key
        ).first()
        if not attr_def:
            errors.append(f"Item #{idx}: Attribute '{item.attribute_key}' not valid for feature type '{feature.type}'")
            continue

        observed_at = item.observed_at or now
        # Default expiry for pending audit: 90 days from observation
        expires_at = observed_at + timedelta(days=90)

        # Pending verification: starts as 'reported' label until approved by verifier
        evidence = Evidence(
            feature_id=item.feature_id,
            attribute_key=item.attribute_key,
            value=item.value,
            label=EvidenceLabel.REPORTED,
            source=EvidenceSource.AUDITOR,
            observer_id=current_user.id,
            verifier_id=None,
            observed_at=observed_at,
            expires_at=expires_at,
            photo_ids=item.photo_ids,
            note=item.note,
            status=EvidenceStatus.PENDING
        )
        db.add(evidence)
        db.flush()

        # Append-only audit log
        record_audit_log(
            db=db,
            actor_id=current_user.id,
            action="audit_batch_item_created",
            entity="evidence",
            entity_id=evidence.id,
            after={
                "feature_id": str(feature.id),
                "attribute_key": item.attribute_key,
                "value": item.value,
                "status": "pending"
            }
        )
        synced_ids.append(evidence.id)

    db.commit()
    return AuditBatchSyncResponse(
        synced_count=len(synced_ids),
        evidence_ids=synced_ids,
        rejected_count=len(errors),
        errors=errors
    )


@router.get("/audits/verification-queue", response_model=List[EvidenceOut])
def get_verification_queue(
    limit: int = Query(50, ge=1, le=100),
    current_user: UserAccount = Depends(require_roles([UserRole.VERIFIER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Retrieve pending evidence items awaiting independent second-person verification."""
    evidence_items = (
        db.query(Evidence)
        .filter(Evidence.status == EvidenceStatus.PENDING)
        .order_by(Evidence.observed_at.asc())
        .limit(limit)
        .all()
    )

    results = []
    for ev in evidence_items:
        feat = ev.feature
        place = feat.place if feat else None
        obs = ev.observer
        results.append(
            EvidenceOut(
                id=ev.id,
                feature_id=ev.feature_id,
                feature_name=feat.name if feat else "Unknown Feature",
                feature_type=feat.type if feat else "unknown",
                place_name=place.name if place else None,
                attribute_key=ev.attribute_key,
                value=ev.value,
                label=ev.label,
                source=ev.source,
                observer_id=ev.observer_id,
                observer_email=obs.email if obs else None,
                verifier_id=ev.verifier_id,
                verifier_email=None,
                observed_at=ev.observed_at,
                expires_at=ev.expires_at,
                photo_ids=ev.photo_ids,
                note=ev.note,
                status=ev.status,
                created_at=ev.created_at
            )
        )
    return results


@router.post("/evidence/{evidence_id}/approve", response_model=EvidenceOut)
def approve_evidence(
    evidence_id: uuid.UUID,
    payload: Optional[EvidenceActionRequest] = None,
    current_user: UserAccount = Depends(require_roles([UserRole.VERIFIER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Approve audit evidence, promoting it to 'verified' with 90-day expiry."""
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    # STRICT RULE 4: Collector is NOT verifier
    if evidence.observer_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Collector cannot verify their own audit. A different verifier is strictly required by Rule 4."
        )

    # STRICT RULE 3: AI can never be verified
    if evidence.source == EvidenceSource.AI:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI generated suggestions can never be marked as verified (Rule 3)."
        )

    before_state = {
        "status": evidence.status,
        "label": evidence.label,
        "verifier_id": str(evidence.verifier_id) if evidence.verifier_id else None
    }

    now = datetime.now(timezone.utc)
    evidence.status = EvidenceStatus.APPROVED
    evidence.label = EvidenceLabel.VERIFIED
    evidence.verifier_id = current_user.id
    evidence.expires_at = now + timedelta(days=90)
    if payload and payload.note:
        evidence.note = (evidence.note or "") + f" [Verifier Note: {payload.note}]"

    db.flush()

    record_audit_log(
        db=db,
        actor_id=current_user.id,
        action="evidence_approved",
        entity="evidence",
        entity_id=evidence.id,
        before=before_state,
        after={
            "status": evidence.status,
            "label": evidence.label,
            "verifier_id": str(evidence.verifier_id),
            "expires_at": evidence.expires_at.isoformat()
        }
    )
    db.commit()

    feat = evidence.feature
    place = feat.place if feat else None
    return EvidenceOut(
        id=evidence.id,
        feature_id=evidence.feature_id,
        feature_name=feat.name if feat else "Feature",
        feature_type=feat.type if feat else "unknown",
        place_name=place.name if place else None,
        attribute_key=evidence.attribute_key,
        value=evidence.value,
        label=evidence.label,
        source=evidence.source,
        observer_id=evidence.observer_id,
        observer_email=evidence.observer.email if evidence.observer else None,
        verifier_id=evidence.verifier_id,
        verifier_email=current_user.email,
        observed_at=evidence.observed_at,
        expires_at=evidence.expires_at,
        photo_ids=evidence.photo_ids,
        note=evidence.note,
        status=evidence.status,
        created_at=evidence.created_at
    )


@router.post("/evidence/{evidence_id}/reject", response_model=EvidenceOut)
def reject_evidence(
    evidence_id: uuid.UUID,
    payload: Optional[EvidenceActionRequest] = None,
    current_user: UserAccount = Depends(require_roles([UserRole.VERIFIER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Reject invalid or inconsistent audit evidence."""
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    if evidence.observer_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Collector cannot moderate or reject their own audit. A different verifier is required."
        )

    before_state = {"status": evidence.status, "label": evidence.label}

    evidence.status = EvidenceStatus.REJECTED
    evidence.verifier_id = current_user.id
    if payload and payload.note:
        evidence.note = (evidence.note or "") + f" [Rejection Reason: {payload.note}]"

    db.flush()
    record_audit_log(
        db=db,
        actor_id=current_user.id,
        action="evidence_rejected",
        entity="evidence",
        entity_id=evidence.id,
        before=before_state,
        after={"status": evidence.status, "rejection_note": payload.note if payload else None}
    )
    db.commit()

    feat = evidence.feature
    place = feat.place if feat else None
    return EvidenceOut(
        id=evidence.id,
        feature_id=evidence.feature_id,
        feature_name=feat.name if feat else "Feature",
        feature_type=feat.type if feat else "unknown",
        place_name=place.name if place else None,
        attribute_key=evidence.attribute_key,
        value=evidence.value,
        label=evidence.label,
        source=evidence.source,
        observer_id=evidence.observer_id,
        observer_email=evidence.observer.email if evidence.observer else None,
        verifier_id=evidence.verifier_id,
        verifier_email=current_user.email,
        observed_at=evidence.observed_at,
        expires_at=evidence.expires_at,
        photo_ids=evidence.photo_ids,
        note=evidence.note,
        status=evidence.status,
        created_at=evidence.created_at
    )


@router.get("/audits/reaudit-queue", response_model=List[ReauditQueueItemOut])
def get_reaudit_queue(
    limit: int = Query(50, ge=1, le=100),
    current_user: UserAccount = Depends(require_roles([UserRole.AUDITOR, UserRole.VERIFIER, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Retrieve features whose accessibility evidence has expired or represents temporary barriers, ranked by impact."""
    now = datetime.now(timezone.utc)

    # 1. Expired evidence
    expired_items = (
        db.query(Evidence)
        .filter(
            Evidence.status == EvidenceStatus.APPROVED,
            Evidence.expires_at <= now
        )
        .order_by(Evidence.expires_at.asc())
        .limit(limit)
        .all()
    )

    results = []
    for ev in expired_items:
        feat = ev.feature
        place = feat.place if feat else None
        days_expired = (now - ev.expires_at).days if ev.expires_at else 0

        # Impact score: count need rules depending on this attribute
        rule_count = db.query(NeedRule).filter(
            NeedRule.feature_type == feat.type,
            NeedRule.attribute_key == ev.attribute_key
        ).count() if feat else 1

        results.append(
            ReauditQueueItemOut(
                feature_id=ev.feature_id,
                feature_name=feat.name if feat else "Feature",
                feature_type=feat.type if feat else "unknown",
                place_id=place.id if place else None,
                place_name=place.name if place else None,
                attribute_key=ev.attribute_key,
                current_label="unknown", # Expired counts as Unknown
                expired_at=ev.expires_at,
                days_since_expiry=max(0, days_expired),
                impact_score=rule_count * 10,
                reason=f"Evidence expired {days_expired} days ago (was {ev.label})"
            )
        )

    # Sort results by impact score descending
    results.sort(key=lambda x: (x.impact_score, x.days_since_expiry), reverse=True)
    return results[:limit]


@router.post("/audits/expiry-sweep")
def trigger_expiry_sweep(
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN, UserRole.MODERATOR])),
    db: Session = Depends(get_db)
):
    """Trigger an immediate expiry sweep over evidence items."""
    now = datetime.now(timezone.utc)
    expired_evidence = (
        db.query(Evidence)
        .filter(
            Evidence.status == EvidenceStatus.APPROVED,
            Evidence.expires_at <= now
        )
        .all()
    )

    count = len(expired_evidence)
    record_audit_log(
        db=db,
        actor_id=current_user.id,
        action="expiry_sweep_executed",
        entity="evidence",
        entity_id=uuid.uuid4(),
        after={"sweep_at": now.isoformat(), "expired_count": count}
    )
    db.commit()

    return {
        "status": "success",
        "swept_at": now.isoformat(),
        "expired_evidence_count": count
    }
