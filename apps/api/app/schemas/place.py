import uuid
from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, ConfigDict
from app.models.place import PlaceType
from app.services.readiness import StepStatus, JourneyVerdictStatus


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

    model_config = ConfigDict(from_attributes=True)


class FeatureReadinessCard(BaseModel):
    feature_id: uuid.UUID
    feature_type: str
    feature_name: str
    floor_level: int
    status: StepStatus
    label: Optional[str] = None
    source: Optional[str] = None
    observed_at: Optional[datetime] = None
    age_days: Optional[int] = None
    expires_at: Optional[datetime] = None
    reason: str
    next_actions: List[Dict[str, Any]] = Field(default_factory=list)


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
