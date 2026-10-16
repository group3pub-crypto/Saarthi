"""Database queries behind place evidence summaries and evidence filters."""
import uuid
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Sequence

from sqlalchemy import and_, exists, func, not_
from sqlalchemy.orm import Session

from app.models.accessibility import Evidence, Feature
from app.models.place import Place
from app.services.evidence_summary import (
    BARRIER_LABELS,
    STATE_KNOWN_BARRIER,
    STATE_REPORTED,
    STATE_UNKNOWN,
    STATE_VERIFIED,
    EvidenceRow,
    EvidenceSummary,
    summarize_evidence,
)


def _current_evidence_exists(
    now: datetime,
    labels: Optional[Sequence[str]] = None,
    fresh_days: Optional[int] = None,
):
    """EXISTS(...) correlated to `place`: current approved evidence, optionally by label / freshness."""
    conditions = [
        Feature.place_id == Place.id,
        Evidence.feature_id == Feature.id,
        Evidence.status == "approved",
        Evidence.expires_at >= now,
    ]
    if labels:
        conditions.append(Evidence.label.in_(list(labels)))
    if fresh_days:
        conditions.append(Evidence.observed_at >= now - timedelta(days=fresh_days))
    return exists().where(and_(*conditions))


def place_evidence_criterion(
    now: datetime,
    state: Optional[str] = None,
    fresh_days: Optional[int] = None,
):
    """Filter criterion matching the place state of `summarize_evidence`, or None if no filter is set.

    `fresh_days` additionally requires at least one current observation made
    within that many days.
    """
    criteria = []

    if state == STATE_KNOWN_BARRIER:
        criteria.append(_current_evidence_exists(now, BARRIER_LABELS))
    elif state == STATE_VERIFIED:
        criteria.append(_current_evidence_exists(now, ("verified",)))
        criteria.append(not_(_current_evidence_exists(now, BARRIER_LABELS)))
    elif state == STATE_REPORTED:
        criteria.append(_current_evidence_exists(now, ("reported",)))
        criteria.append(not_(_current_evidence_exists(now, ("verified",) + tuple(BARRIER_LABELS))))
    elif state == STATE_UNKNOWN:
        criteria.append(not_(_current_evidence_exists(now)))

    if fresh_days:
        criteria.append(_current_evidence_exists(now, None, fresh_days))

    if not criteria:
        return None
    return and_(*criteria)


def load_place_evidence_summaries(
    db: Session,
    place_ids: Iterable[uuid.UUID],
    now: datetime,
) -> Dict[uuid.UUID, EvidenceSummary]:
    """Evidence summaries for several places using two aggregate queries (no per-place queries)."""
    ids: List[uuid.UUID] = list(place_ids)
    if not ids:
        return {}

    feature_counts = {
        place_id: count
        for place_id, count in (
            db.query(Feature.place_id, func.count(Feature.id))
            .filter(Feature.place_id.in_(ids))
            .group_by(Feature.place_id)
            .all()
        )
    }

    rows_by_place: Dict[uuid.UUID, List[EvidenceRow]] = {}
    evidence_rows = (
        db.query(
            Feature.place_id,
            Evidence.feature_id,
            Evidence.label,
            Evidence.observed_at,
            Evidence.expires_at,
        )
        .select_from(Feature)
        .join(Evidence, Evidence.feature_id == Feature.id)
        .filter(Feature.place_id.in_(ids), Evidence.status == "approved")
        .all()
    )
    for place_id, feature_id, label, observed_at, expires_at in evidence_rows:
        rows_by_place.setdefault(place_id, []).append(
            EvidenceRow(
                feature_id=str(feature_id),
                label=getattr(label, "value", label),
                observed_at=observed_at,
                expires_at=expires_at,
            )
        )

    return {
        place_id: summarize_evidence(
            feature_counts.get(place_id, 0),
            rows_by_place.get(place_id, []),
            now,
        )
        for place_id in ids
    }
