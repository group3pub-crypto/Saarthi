from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.operations import UserAccount
from app.core.security import verify_password, create_access_token
from app.core.permissions import get_current_user
from app.schemas.auth import LoginRequest, TokenResponse, UserAccountOut
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication & Staff Accounts"])


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate staff member via JSON email and password."""
    user = db.query(UserAccount).filter(UserAccount.email == request.email).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        data={"sub": str(user.id), "role": user.role, "email": user.email},
        expires_delta=access_token_expires
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        role=user.role
    )


@router.post("/token", response_model=TokenResponse)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """OAuth2 compatible token endpoint for Swagger and automated tools."""
    user = db.query(UserAccount).filter(UserAccount.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(
        data={"sub": str(user.id), "role": user.role, "email": user.email},
        expires_delta=access_token_expires
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        role=user.role
    )


@router.get("/me", response_model=UserAccountOut)
def get_me(current_user: UserAccount = Depends(get_current_user)):
    """Return the currently authenticated staff account."""
    return current_user
