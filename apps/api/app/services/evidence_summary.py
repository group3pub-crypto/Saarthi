"""Evidence summaries for places: what is on file, and how fresh it is.

A summary describes the evidence record only. It is never a verdict that a
place is accessible: that needs a journey evaluation against someone's needs.
Pure module: no database or network access, so it is easy to test.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

BARRIER_LABELS = ("barrier", "temporary_barrier")

STATE_KNOWN_BARRIER = "known_barrier"
STATE_VERIFIED = "verified"
STATE_REPORTED = "reported"
STATE_UNKNOWN = "unknown"

EVIDENCE_STATES = (STATE_KNOWN_BARRIER, STATE_VERIFIED, STATE_REPORTED, STATE_UNKNOWN)


@dataclass(frozen=True)
class EvidenceRow:
    """One approved observation for a feature of a place."""
    feature_id: str
    label: str  # 'verified' | 'reported' | 'barrier' | 'temporary_barrier'
    observed_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class EvidenceSummary:
    state: str
    feature_count: int
    features_with_current_evidence: int
    current_observation_count: int
    verified_count: int
    reported_count: int
    barrier_count: int
    expired_count: int
    last_observed_at: Optional[datetime]
    next_expiry_at: Optional[datetime]


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def summarize_evidence(feature_count: int, rows: Iterable[EvidenceRow], now: datetime) -> EvidenceSummary:
    """Summarise approved evidence for one place.

    Precedence of the place state, worst first: known barrier, then verified,
    then reported, otherwise unknown. Expired observations are not current:
    they count as unknown, exactly like in the readiness engine.
    """
    now = _aware(now)

    current_features = set()
    current_count = verified = reported = barrier = expired = 0
    last_observed: Optional[datetime] = None
    next_expiry: Optional[datetime] = None

    for row in rows:
        observed = _aware(row.observed_at)
        expires = _aware(row.expires_at)

        if last_observed is None or observed > last_observed:
            last_observed = observed

        if now > expires:
            expired += 1
            continue

        current_count += 1
        current_features.add(row.feature_id)
        if next_expiry is None or expires < next_expiry:
            next_expiry = expires

        if row.label in BARRIER_LABELS:
            barrier += 1
        elif row.label == "verified":
            verified += 1
        elif row.label == "reported":
            reported += 1

    if barrier > 0:
        state = STATE_KNOWN_BARRIER
    elif verified > 0:
        state = STATE_VERIFIED
    elif reported > 0:
        state = STATE_REPORTED
    else:
        state = STATE_UNKNOWN

    return EvidenceSummary(
        state=state,
        feature_count=feature_count,
        features_with_current_evidence=len(current_features),
        current_observation_count=current_count,
        verified_count=verified,
        reported_count=reported,
        barrier_count=barrier,
        expired_count=expired,
        last_observed_at=last_observed,
        next_expiry_at=next_expiry,
    )
