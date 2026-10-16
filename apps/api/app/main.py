from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from app.config import settings
from app.routers import places, journeys, auth, audits, admin

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Disability-first accessibility platform providing deterministic public journey readiness evaluations.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.exception_handler(OperationalError)
async def db_operational_error_handler(request: Request, exc: OperationalError):
    return JSONResponse(
        status_code=503,
        content={"detail": "Database service is currently unreachable. Please ensure PostgreSQL/PostGIS is running."}
    )

# CORS middleware for Web PWA client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers with /api/v1 version prefix
app.include_router(auth.router, prefix="/api/v1")
app.include_router(audits.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(places.router)
app.include_router(journeys.router)

# Root aliases
app.include_router(auth.router)
app.include_router(audits.router)
app.include_router(admin.router)


@app.get("/health", tags=["System"])
def health_check():
    """System health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENV
    }

