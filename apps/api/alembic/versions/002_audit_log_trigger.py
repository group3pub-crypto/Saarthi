"""Enforce append-only immutability on audit_log via trigger

Revision ID: 002_audit_log_trigger
Revises: 001_initial_schema
Create Date: 2026-10-15 17:05:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = '002_audit_log_trigger'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
    RETURNS TRIGGER AS $$
    BEGIN
        RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE operations are strictly forbidden';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON audit_log;
    CREATE TRIGGER trg_prevent_audit_log_modification
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
    """)


def downgrade() -> None:
    op.execute("""
    DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON audit_log;
    DROP FUNCTION IF EXISTS prevent_audit_log_modification();
    """)
