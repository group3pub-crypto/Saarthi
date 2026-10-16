from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.journey import JourneyPlanRequest, JourneyPlanResponse
from app.services.router import plan_accessible_journey

router = APIRouter(prefix="/api/v1/journeys", tags=["Journeys"])


@router.post("/plan", response_model=JourneyPlanResponse)
def plan_journey_route(
    request: JourneyPlanRequest,
    db: Session = Depends(get_db)
):
    """Plan an accessible journey from origin coordinates to a public service destination.

    Combines pgRouting pedestrian network navigation with deterministic readiness evaluation.
    """
    try:
        verdict = plan_accessible_journey(
            db=db,
            origin=request.origin,
            destination_place_id=request.destination_place_id,
            needs=request.needs
        )
        return verdict
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
