import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class AttributeDefOut(BaseModel):
    id: uuid.UUID
    feature_type: str
    key: str
    value_type: str
    unit: Optional[str] = None
    description: str

    class Config:
        from_attributes = True


class AuditBatchItem(BaseModel):
    feature_id: uuid.UUID
    attribute_key: str
    value: Any
    observed_at: Optional[datetime] = None
    note: Optional[str] = None
    photo_ids: List[uuid.UUID] = Field(default_factory=list)


class AuditBatchSyncRequest(BaseModel):
    items: List[AuditBatchItem]


class AuditBatchSyncResponse(BaseModel):
    synced_count: int
    evidence_ids: List[uuid.UUID]
    rejected_count: int = 0
    errors: List[str] = Field(default_factory=list)


class EvidenceOut(BaseModel):
    id: uuid.UUID
    feature_id: uuid.UUID
    feature_name: Optional[str] = None
    feature_type: Optional[str] = None
    place_name: Optional[str] = None
    attribute_key: str
    value: Any
    label: str
    source: str
    observer_id: Optional[uuid.UUID] = None
    observer_email: Optional[str] = None
    verifier_id: Optional[uuid.UUID] = None
    verifier_email: Optional[str] = None
    observed_at: datetime
    expires_at: datetime
    photo_ids: List[uuid.UUID] = Field(default_factory=list)
    note: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class EvidenceActionRequest(BaseModel):
    note: Optional[str] = None


class AuditAssignmentOut(BaseModel):
    place_id: uuid.UUID
    place_name: str
    place_type: str
    address: str
    department: Optional[str] = None
    ward_name: Optional[str] = None
    latitude: float
    longitude: float
    total_features: int
    unverified_features: int
    priority_score: float


class ReauditQueueItemOut(BaseModel):
    feature_id: uuid.UUID
    feature_name: str
    feature_type: str
    place_id: Optional[uuid.UUID] = None
    place_name: Optional[str] = None
    attribute_key: str
    current_label: str
    expired_at: Optional[datetime] = None
    days_since_expiry: int
    impact_score: int
    reason: str
