import uuid
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app.models.operations import AuditLog


def record_audit_log(
    db: Session,
    action: str,
    entity: str,
    entity_id: uuid.UUID,
    actor_id: Optional[uuid.UUID] = None,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Record an append-only audit log entry for every state modification."""
    log_entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after
    )
    db.add(log_entry)
    db.flush()
    return log_entry
