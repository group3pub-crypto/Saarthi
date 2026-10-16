import uuid
from datetime import datetime, timezone
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.accessibility import Evidence, EvidenceStatus
from app.core.audit import record_audit_log


def run_expiry_sweep(db: Session, actor_id: uuid.UUID | None = None) -> Dict[str, Any]:
    """
    Scan approved evidence records whose expires_at is past now.
    Records audit log and returns summary of expired records.
    """
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
    expired_ids = [str(ev.id) for ev in expired_evidence]

    record_audit_log(
        db=db,
        actor_id=actor_id,
        action="scheduled_expiry_sweep",
        entity="evidence",
        entity_id=uuid.uuid4(),
        after={
            "sweep_timestamp": now.isoformat(),
            "expired_count": count,
            "expired_ids": expired_ids[:50]
        }
    )
    db.commit()

    return {
        "status": "completed",
        "timestamp": now.isoformat(),
        "expired_count": count,
        "sample_expired_ids": expired_ids[:10]
    }
