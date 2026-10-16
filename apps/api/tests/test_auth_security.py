import uuid
from datetime import timedelta
import pytest
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.core.audit import record_audit_log
from app.models.operations import AuditLog


def test_password_hashing():
    raw_pw = "SuperSecurePassword123!"
    hashed = hash_password(raw_pw)

    assert hashed != raw_pw
    assert verify_password(raw_pw, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False


def test_jwt_token_lifecycle():
    user_id = str(uuid.uuid4())
    claims = {"sub": user_id, "role": "admin"}

    token = create_access_token(claims, expires_delta=timedelta(minutes=15))
    decoded = decode_access_token(token)

    assert decoded is not None
    assert decoded["sub"] == user_id
    assert decoded["role"] == "admin"


def test_expired_jwt_token_rejected():
    claims = {"sub": str(uuid.uuid4()), "role": "auditor"}
    # Token expired 1 hour ago
    token = create_access_token(claims, expires_delta=timedelta(hours=-1))
    decoded = decode_access_token(token)

    assert decoded is None


def test_tampered_jwt_token_rejected():
    claims = {"sub": str(uuid.uuid4()), "role": "auditor"}
    token = create_access_token(claims)
    tampered = token[:-4] + "fake"

    decoded = decode_access_token(tampered)
    assert decoded is None


def test_record_audit_log(db_session):
    from tests.factories import create_test_user
    from app.models.operations import UserRole

    user = create_test_user(db_session, role=UserRole.ADMIN)
    entity_id = uuid.uuid4()

    entry = record_audit_log(
        db=db_session,
        action="update_status",
        entity="evidence",
        entity_id=entity_id,
        actor_id=user.id,
        before={"status": "pending"},
        after={"status": "approved"}
    )
    db_session.flush()

    assert entry.id is not None
    assert entry.action == "update_status"
    assert entry.entity == "evidence"
    assert entry.entity_id == entity_id
    assert entry.actor_id == user.id
    assert entry.before == {"status": "pending"}
    assert entry.after == {"status": "approved"}
