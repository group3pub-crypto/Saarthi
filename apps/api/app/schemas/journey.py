import uuid
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from app.services.readiness import JourneyVerdictStatus, StepStatus, NextAction


class Coordinate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class JourneyPlanRequest(BaseModel):
    origin: Coordinate
    destination_place_id: uuid.UUID
    needs: List[str] = Field(default_factory=lambda: ["step_free"])


class RouteSegmentDetail(BaseModel):
    segment_id: Optional[uuid.UUID] = None
    kind: str
    length_m: float
    coordinates: List[List[float]] # [[lng, lat], ...]


class JourneyStepDetail(BaseModel):
    step_id: str
    feature_id: str
    feature_type: str
    description: str
    floor_level: int
    is_critical: bool
    status: StepStatus
    label: Optional[str] = None
    source: Optional[str] = None
    observed_at: Optional[str] = None
    age_days: Optional[int] = None
    expires_at: Optional[str] = None
    reason: str
    next_actions: List[Dict[str, Any]] = Field(default_factory=list)


class JourneyPlanResponse(BaseModel):
    destination_name: str
    destination_address: str
    destination_phone: Optional[str] = None
    total_distance_m: float
    overall_status: JourneyVerdictStatus
    confidence_score: float
    summary_text: str
    limits_notice: str
    active_needs: List[str]
    route_geometry: Dict[str, Any] # GeoJSON LineString
    steps: List[JourneyStepDetail]
    next_actions: List[Dict[str, Any]] = Field(default_factory=list)
