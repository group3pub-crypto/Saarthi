from typing import List

from pydantic import BaseModel, Field

from app.schemas.place import RequirementOut


class RequirementsResponse(BaseModel):
    active_needs: List[str]
    requirements: List[RequirementOut] = Field(default_factory=list)
    unevaluated_needs: List[str] = Field(default_factory=list)
    ignored_thresholds: List[str] = Field(default_factory=list)
