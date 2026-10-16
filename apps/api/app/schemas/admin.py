import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class AdminUserCreateRequest(BaseModel):
    email: str
    password: str
    role: str


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    created_at: datetime


class AuditLogOut(BaseModel):
    id: uuid.UUID
    actor_id: Optional[uuid.UUID] = None
    actor_email: Optional[str] = None
    action: str
    entity: str
    entity_id: uuid.UUID
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    at: datetime


class CoverageStatsOut(BaseModel):
    total_places: int
    total_features: int
    verified_features: int
    reported_features: int
    unknown_features: int
    barrier_features: int
    coverage_pct: float
    by_place_type: Dict[str, Dict[str, int]]
    by_ward: Dict[str, int]


class BarrierLedgerItemOut(BaseModel):
    id: uuid.UUID
    place_id: Optional[uuid.UUID] = None
    place_name: str
    feature_id: uuid.UUID
    feature_name: str
    feature_type: str
    attribute_key: str
    value: Any
    observed_at: datetime
    impact_score: int
    escalation_id: Optional[uuid.UUID] = None
    escalation_status: Optional[str] = None


class CreateEscalationRequest(BaseModel):
    feature_id: Optional[uuid.UUID] = None
    evidence_id: Optional[uuid.UUID] = None
    authority: str
    deadline_days: int = Field(default=14, ge=1, le=180)
    public_note: Optional[str] = None


class EscalationOut(BaseModel):
    id: uuid.UUID
    feature_id: Optional[uuid.UUID] = None
    evidence_id: Optional[uuid.UUID] = None
    authority: str
    forwarded_at: datetime
    deadline: datetime
    public_status: str
    public_note: Optional[str] = None


class UserReportItemOut(BaseModel):
    id: uuid.UUID
    feature_id: uuid.UUID
    feature_name: str
    place_name: Optional[str] = None
    attribute_key: str
    value: Any
    anonymous_token: str
    comment: Optional[str] = None
    status: str
    created_at: datetime


class ResolveReportRequest(BaseModel):
    action: str = Field(..., description="'promote_to_evidence' or 'dismiss'")
    note: Optional[str] = None


class SettingItem(BaseModel):
    key: str
    value: Any
    updated_at: datetime


class SystemMetricsOut(BaseModel):
    total_places: int
    total_features: int
    coverage_pct: float
    active_barriers_count: int
    pending_verifications_count: int
    open_reports_count: int
    escalations_count: int
