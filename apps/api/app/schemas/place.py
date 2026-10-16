import uuid
from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, ConfigDict
from app.models.place import PlaceType
from app.services.readiness import StepStatus, JourneyVerdictStatus


class PlaceEvidenceSummary(BaseModel):
    """What evidence is on file for a place and how fresh it is.

    This describes the evidence record only. It is never a verdict that the
    place is accessible: that needs a journey evaluation against someone's needs.
    """
    state: str = Field(description="known_barrier | verified | reported | unknown")
    feature_count: int = Field(description="Features recorded for the place")
    features_with_current_evidence: int = Field(description="Features with at least one current approved observation")
    current_observation_count: int
    verified_count: int
    reported_count: int
    barrier_count: int
    expired_count: int = Field(description="Approved observations that have expired and now count as unknown")
    last_observed_at: Optional[datetime] = None
    next_expiry_at: Optional[datetime] = None


class PlaceSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    type: PlaceType
    address: str
    latitude: float
    longitude: float
    department: Optional[str] = None
    phone: Optional[str] = None
    hours: Optional[str] = None
    source: str
    ward_id: Optional[uuid.UUID] = None
    distance_m: Optional[float] = None
    evidence: Optional[PlaceEvidenceSummary] = None

    model_config = ConfigDict(from_attributes=True)


class FeatureReadinessCard(BaseModel):
    feature_id: uuid.UUID
    feature_type: str
    feature_name: str
    floor_level: int
    status: StepStatus
    applicable: bool = True
    label: Optional[str] = None
    source: Optional[str] = None
    observed_at: Optional[datetime] = None
    age_days: Optional[int] = None
    expires_at: Optional[datetime] = None
    reason: str
    next_actions: List[Dict[str, Any]] = Field(default_factory=list)


class RequirementOut(BaseModel):
    """One rule a verdict was evaluated against."""
    need_code: str
    feature_type: str
    attribute_key: str
    operator: str
    threshold: Any = None
    standard_threshold: Any = None
    critical: bool = True
    custom: bool = False


class PlaceReadinessCardResponse(BaseModel):
    place_id: uuid.UUID
    name: str
    type: PlaceType
    address: str
    latitude: float
    longitude: float
    phone: Optional[str] = None
    overall_status: JourneyVerdictStatus
    confidence_score: float
    active_needs: List[str]
    features: List[FeatureReadinessCard]
    summary_text: str
    limits_notice: str
    evaluated_at: Optional[datetime] = None
    requirements: List[RequirementOut] = Field(default_factory=list)
    unevaluated_needs: List[str] = Field(default_factory=list)
    ignored_thresholds: List[str] = Field(default_factory=list)
