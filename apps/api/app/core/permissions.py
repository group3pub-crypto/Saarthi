from enum import Enum
from typing import List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import decode_access_token


class UserRole(str, Enum):
    AUDITOR = "auditor"
    VERIFIER = "verifier"
    MODERATOR = "moderator"
    ADMIN = "admin"
    INSTITUTION_ADMIN = "institution_admin"
    PARTNER_NGO = "partner_ngo"


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Validate JWT token and return the authenticated user account."""
    from app.models.operations import UserAccount

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(UserAccount).filter(UserAccount.id == user_id, UserAccount.is_active.is_(True)).first()
    if user is None:
        raise credentials_exception
    return user


def require_roles(allowed_roles: List[UserRole]):
    """Enforce that the authenticated user possesses one of the allowed roles."""
    def role_checker(current_user=Depends(get_current_user)):
        if current_user.role not in [r.value for r in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted for role '{current_user.role}'. Required one of: {[r.value for r in allowed_roles]}"
            )
        return current_user
    return role_checker
