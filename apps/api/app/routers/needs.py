from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.accessibility import NeedRule
from app.schemas.place import RequirementOut
from app.schemas.needs import RequirementsResponse
from app.services.readiness import (
    NeedRuleDefinition,
    apply_threshold_overrides,
    describe_requirements,
    thresholds_to_overrides,
)

router = APIRouter(prefix="/api/v1/needs", tags=["Needs"])


@router.get("/requirements", response_model=RequirementsResponse)
def get_requirements(
    needs: str = Query("", description="Comma-separated need codes, e.g. 'wheelchair,tactile'"),
    min_door_width_cm: Optional[float] = Query(None, ge=50, le=200),
    max_ramp_slope_pct: Optional[float] = Query(None, ge=1, le=20),
    max_kerb_height_cm: Optional[float] = Query(None, ge=0, le=30),
    db: Session = Depends(get_db),
):
    """Which requirements a set of needs (and own thresholds) is evaluated against.

    Takes only anonymous need codes and plain numbers, never a profile. Needs that
    have no evaluation rules are listed in `unevaluated_needs`: they cannot confirm anything.
    """
    need_codes: List[str] = []
    for code in needs.split(","):
        code = code.strip()
        if code and code not in need_codes:
            need_codes.append(code)

    db_rules = db.query(NeedRule).filter(NeedRule.need_code.in_(need_codes)).all() if need_codes else []
    rules = [
        NeedRuleDefinition(
            need_code=r.need_code,
            feature_type=r.feature_type.value,
            attribute_key=r.attribute_key,
            operator=r.operator.value,
            threshold=r.threshold,
            critical=r.critical,
        )
        for r in db_rules
    ]

    overrides = thresholds_to_overrides({
        "min_door_width_cm": min_door_width_cm,
        "max_ramp_slope_pct": max_ramp_slope_pct,
        "max_kerb_height_cm": max_kerb_height_cm,
    })
    outcome = apply_threshold_overrides(rules, need_codes, overrides)
    requirements, unevaluated = describe_requirements(outcome.rules, outcome.needs)

    return RequirementsResponse(
        active_needs=outcome.needs,
        requirements=[RequirementOut(**r) for r in requirements],
        unevaluated_needs=unevaluated,
        ignored_thresholds=outcome.ignored_keys,
    )
