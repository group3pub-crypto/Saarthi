"""Add gid column to segment for pgRouting integer edge id

Revision ID: 003_add_segment_gid
Revises: 002_audit_log_trigger
Create Date: 2026-10-15 17:35:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '003_add_segment_gid'
down_revision: Union[str, None] = '002_audit_log_trigger'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('segment', sa.Column('gid', sa.BigInteger(), autoincrement=True, nullable=True))
    op.execute("CREATE SEQUENCE IF NOT EXISTS segment_gid_seq;")
    op.execute("ALTER TABLE segment ALTER COLUMN gid SET DEFAULT nextval('segment_gid_seq');")
    op.execute("UPDATE segment SET gid = nextval('segment_gid_seq') WHERE gid IS NULL;")
    op.alter_column('segment', 'gid', nullable=False)
    op.create_unique_constraint('uq_segment_gid', 'segment', ['gid'])
    op.create_index('idx_segment_gid', 'segment', ['gid'])


def downgrade() -> None:
    op.drop_index('idx_segment_gid', table_name='segment')
    op.drop_constraint('uq_segment_gid', 'segment', type_='unique')
    op.drop_column('segment', 'gid')
    op.execute("DROP SEQUENCE IF EXISTS segment_gid_seq;")
