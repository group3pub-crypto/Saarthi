import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
    email: str
    role: str


class UserAccountOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
