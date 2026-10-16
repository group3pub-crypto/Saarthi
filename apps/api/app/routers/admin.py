import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from app.database import get_db
from app.models.accessibility import (
    Feature, Evidence, NeedRule, UserReport,
    EvidenceLabel, EvidenceSource, EvidenceStatus
)
from app.models.place import Place, Ward
from app.models.operations import (
    UserAccount, UserRole, AuditLog, Escalation, Setting, MetricEvent
)
from app.core.permissions import get_current_user, require_roles
from app.core.security import hash_password
from app.core.audit import record_audit_log
from app.schemas.admin import (
    AdminUserCreateRequest, AdminUserOut, AuditLogOut,
    CoverageStatsOut, BarrierLedgerItemOut, CreateEscalationRequest, EscalationOut,
    UserReportItemOut, ResolveReportRequest, SettingItem, SystemMetricsOut
)

router = APIRouter(prefix="", tags=["Admin Console & Civic Governance"])


# Public Transparency Coverage Endpoint
@router.get("/coverage", response_model=CoverageStatsOut)
def get_public_coverage(db: Session = Depends(get_db)):
    """Public coverage and transparency statistics across Pune municipal wards."""
    total_places = db.query(Place).count()
    total_features = db.query(Feature).count()

    now = datetime.now(timezone.utc)
    verified_features = (
        db.query(Evidence.feature_id)
        .filter(
            Evidence.status == EvidenceStatus.APPROVED,
            Evidence.label == EvidenceLabel.VERIFIED,
            Evidence.expires_at > now
        )
        .distinct()
        .count()
    )

    reported_features = (
        db.query(Evidence.feature_id)
        .filter(
            Evidence.status == EvidenceStatus.APPROVED,
            Evidence.label == EvidenceLabel.REPORTED,
            Evidence.expires_at > now
        )
        .distinct()
        .count()
    )

    barrier_features = (
        db.query(Evidence.feature_id)
        .filter(
            Evidence.status == EvidenceStatus.APPROVED,
            or_(
                Evidence.label == EvidenceLabel.BARRIER,
                Evidence.label == EvidenceLabel.TEMPORARY_BARRIER
            )
        )
        .distinct()
        .count()
    )

    unknown_features = max(0, total_features - verified_features - reported_features - barrier_features)
    coverage_pct = round((verified_features / total_features * 100), 2) if total_features > 0 else 0.0

    # Group by place type
    by_place_type: Dict[str, Dict[str, int]] = {}
    place_types = db.query(Place.type, func.count(Place.id)).group_by(Place.type).all()
    for pt, count in place_types:
        by_place_type[pt] = {
            "total_places": count,
            "audited": db.query(Feature).join(Place).filter(
                Place.type == pt,
                Feature.evidence_items.any(Evidence.status == EvidenceStatus.APPROVED)
            ).count()
        }

    # Group by ward
    by_ward: Dict[str, int] = {}
    wards = db.query(Ward.name, func.count(Place.id)).outerjoin(Place, Place.ward_id == Ward.id).group_by(Ward.name).all()
    for w_name, count in wards:
        by_ward[w_name] = count

    return CoverageStatsOut(
        total_places=total_places,
        total_features=total_features,
        verified_features=verified_features,
        reported_features=reported_features,
        unknown_features=unknown_features,
        barrier_features=barrier_features,
        coverage_pct=coverage_pct,
        by_place_type=by_place_type,
        by_ward=by_ward
    )


# Admin Metrics Dashboard
@router.get("/admin/metrics", response_model=SystemMetricsOut)
def get_system_metrics(
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN, UserRole.MODERATOR])),
    db: Session = Depends(get_db)
):
    """Aggregate high-level governance and accessibility audit metrics."""
    total_places = db.query(Place).count()
    total_features = db.query(Feature).count()

    now = datetime.now(timezone.utc)
    verified_features = (
        db.query(Evidence.feature_id)
        .filter(
            Evidence.status == EvidenceStatus.APPROVED,
            Evidence.label == EvidenceLabel.VERIFIED,
            Evidence.expires_at > now
        )
        .distinct()
        .count()
    )
    coverage_pct = round((verified_features / total_features * 100), 2) if total_features > 0 else 0.0

    active_barriers = db.query(Evidence).filter(
        Evidence.status == EvidenceStatus.APPROVED,
        or_(
            Evidence.label == EvidenceLabel.BARRIER,
            Evidence.label == EvidenceLabel.TEMPORARY_BARRIER
        )
    ).count()

    pending_verifications = db.query(Evidence).filter(
        Evidence.status == EvidenceStatus.PENDING
    ).count()

    open_reports = db.query(UserReport).filter(
        UserReport.status == "open"
    ).count()

    escalations_count = db.query(Escalation).count()

    return SystemMetricsOut(
        total_places=total_places,
        total_features=total_features,
        coverage_pct=coverage_pct,
        active_barriers_count=active_barriers,
        pending_verifications_count=pending_verifications,
        open_reports_count=open_reports,
        escalations_count=escalations_count
    )


# Staff User Accounts
@router.get("/admin/users", response_model=List[AdminUserOut])
def list_staff_users(
    role: Optional[str] = Query(None),
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """List staff accounts and roles."""
    query = db.query(UserAccount)
    if role:
        query = query.filter(UserAccount.role == role)
    return query.order_by(UserAccount.created_at.desc()).all()


@router.post("/admin/users", response_model=AdminUserOut)
def create_staff_user(
    payload: AdminUserCreateRequest,
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Create a new staff account (auditor, verifier, moderator, etc.)."""
    existing = db.query(UserAccount).filter(UserAccount.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account with this email already exists")

    try:
        user_role = UserRole(payload.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role '{payload.role}'")

    new_user = UserAccount(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=user_role,
        is_active=True
    )
    db.add(new_user)
    db.flush()

    record_audit_log(
        db=db,
        actor_id=current_user.id,
        action="user_account_created",
        entity="user_account",
        entity_id=new_user.id,
        after={"email": new_user.email, "role": new_user.role}
    )
    db.commit()

    return new_user


# Append-Only Audit Log Viewer
@router.get("/admin/ledger", response_model=List[AuditLogOut])
def get_audit_ledger(
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN, UserRole.MODERATOR])),
    db: Session = Depends(get_db)
):
    """View append-only audit log records documenting every system mutation."""
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.order_by(AuditLog.at.desc()).limit(limit).all()

    results = []
    for l in logs:
        actor_email = l.actor.email if l.actor else None
        results.append(
            AuditLogOut(
                id=l.id,
                actor_id=l.actor_id,
                actor_email=actor_email,
                action=l.action,
                entity=l.entity,
                entity_id=l.entity_id,
                before=l.before,
                after=l.after,
                at=l.at
            )
        )
    return results


def _build_barrier_ledger(db: Session) -> List[BarrierLedgerItemOut]:
    barriers = (
        db.query(Evidence)
        .filter(
            Evidence.status == EvidenceStatus.APPROVED,
            or_(
                Evidence.label == EvidenceLabel.BARRIER,
                Evidence.label == EvidenceLabel.TEMPORARY_BARRIER
            )
        )
        .order_by(Evidence.observed_at.desc())
        .limit(100)
        .all()
    )

    items = []
    for b in barriers:
        feat = b.feature
        place = feat.place if feat else None

        # Impact score based on dependent need rules
        rule_count = db.query(NeedRule).filter(
            NeedRule.feature_type == feat.type,
            NeedRule.attribute_key == b.attribute_key
        ).count() if feat else 1

        # Check existing escalation
        esc = db.query(Escalation).filter(Escalation.evidence_id == b.id).first()

        items.append(
            BarrierLedgerItemOut(
                id=b.id,
                place_id=place.id if place else None,
                place_name=place.name if place else "Pedestrian Segment",
                feature_id=b.feature_id,
                feature_name=feat.name if feat else "Feature",
                feature_type=feat.type if feat else "unknown",
                attribute_key=b.attribute_key,
                value=b.value,
                observed_at=b.observed_at,
                impact_score=rule_count * 15,
                escalation_id=esc.id if esc else None,
                escalation_status=esc.public_status if esc else None
            )
        )

    items.sort(key=lambda x: x.impact_score, reverse=True)
    return items


# Public Barrier Ledger (Civic Transparency)
@router.get("/public/barrier-ledger", response_model=List[BarrierLedgerItemOut])
def get_public_barrier_ledger(db: Session = Depends(get_db)):
    """Public transparency ledger of recorded accessibility barriers and civic escalations."""
    return _build_barrier_ledger(db)


# Barrier Ledger & Civic Escalations
@router.get("/admin/barrier-ledger", response_model=List[BarrierLedgerItemOut])
def get_barrier_ledger(
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN, UserRole.MODERATOR])),
    db: Session = Depends(get_db)
):
    """Retrieve verified and reported physical accessibility barriers ranked by impact."""
    return _build_barrier_ledger(db)


@router.post("/admin/escalations", response_model=EscalationOut)
def create_civic_escalation(
    payload: CreateEscalationRequest,
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN, UserRole.MODERATOR])),
    db: Session = Depends(get_db)
):
    """Forward an identified physical barrier to a responsible civic authority with a deadline."""
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(days=payload.deadline_days)

    esc = Escalation(
        feature_id=payload.feature_id,
        evidence_id=payload.evidence_id,
        authority=payload.authority,
        forwarded_at=now,
        deadline=deadline,
        public_status="forwarded_to_authority",
        public_note=payload.public_note
    )
    db.add(esc)
    db.flush()

    record_audit_log(
        db=db,
        actor_id=current_user.id,
        action="escalation_created",
        entity="escalation",
        entity_id=esc.id,
        after={
            "authority": payload.authority,
            "deadline": deadline.isoformat(),
            "evidence_id": str(payload.evidence_id) if payload.evidence_id else None
        }
    )
    db.commit()
    return esc


@router.get("/admin/escalations", response_model=List[EscalationOut])
def list_civic_escalations(
    current_user: UserAccount = Depends(require_roles([UserRole.ADMIN, UserRole.MODERATOR])),
    db: Session = Depends(get_db)
):
    """List all forwarded civic barrier escalations."""
    return db.query(Escalation).order_by(Escalation.forwarded_at.desc()).all()


# Moderation Queue for Citizen Reports
@router.get("/admin/moderation/queue", response_model=List[UserReportItemOut])
def get_moderation_queue(
    current_user: UserAccount = Depends(require_roles([UserRole.MODERATOR, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Retrieve citizen issue reports awaiting moderation."""
    reports = db.query(UserReport).filter(UserReport.status == "open").order_by(UserReport.created_at.asc()).limit(50).all()
    results = []
    for r in reports:
        feat = r.feature
        place = feat.place if feat else None
        results.append(
            UserReportItemOut(
                id=r.id,
                feature_id=r.feature_id,
                feature_name=feat.name if feat else "Feature",
                place_name=place.name if place else None,
                attribute_key=r.attribute_key,
                value=r.value,
                anonymous_token=r.anonymous_token,
                comment=r.comment,
                status=r.status,
                created_at=r.created_at
            )
        )
    return results


@router.post("/admin/reports/{report_id}/resolve")
def resolve_citizen_report(
    report_id: uuid.UUID,
    payload: ResolveReportRequest,
    current_user: UserAccount = Depends(require_roles([UserRole.MODERATOR, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    """Resolve a citizen issue report (promote to reported evidence or dismiss)."""
    report = db.query(UserReport).filter(UserReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.status = "resolved"

    if payload.action == "promote_to_evidence":
        now = datetime.now(timezone.utc)
        evidence = Evidence(
            feature_id=report.feature_id,
            attribute_key=report.attribute_key,
            value=report.value,
            label=EvidenceLabel.REPORTED,
            source=EvidenceSource.USER,
            observer_id=None,
            verifier_id=None,
            observed_at=report.created_at,
            expires_at=now + timedelta(days=30),
            note=f"Promoted from user report ({payload.note or 'Verified by moderator'})",
            status=EvidenceStatus.APPROVED
        )
        db.add(evidence)
        db.flush()

    record_audit_log(
        db=db,
        actor_id=current_user.id,
        action="citizen_report_resolved",
        entity="user_report",
        entity_id=report.id,
        after={"action": payload.action, "note": payload.note}
    )
    db.commit()

    return {"status": "success", "report_id": str(report.id), "action": payload.action}
