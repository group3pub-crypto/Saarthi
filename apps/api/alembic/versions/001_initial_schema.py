"""Initial schema with PostGIS, pgRouting, and constraints

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-15 16:50:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from geoalchemy2 import Geometry

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Extensions (ensure created)
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgrouting;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    # 1. Ward
    op.create_table(
        'ward',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('geom', Geometry(geometry_type='MULTIPOLYGON', srid=4326), nullable=False)
    )

    # 2. Place
    place_type = sa.Enum('hospital', 'municipal_office', 'transport_hub', 'aadhaar_centre', 'ration_centre', 'court', 'bus_stop', 'other', name='place_type', create_type=True)

    op.create_table(
        'place',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('type', place_type, nullable=False),
        sa.Column('address', sa.Text(), nullable=False),
        sa.Column('geom', Geometry(geometry_type='POINT', srid=4326), nullable=False),
        sa.Column('department', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('hours', sa.String(255), nullable=True),
        sa.Column('source', sa.String(100), nullable=False),
        sa.Column('ward_id', UUID(as_uuid=True), sa.ForeignKey('ward.id', ondelete='SET NULL'), nullable=True),
        sa.Column('osm_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('idx_place_type', 'place', ['type'])
    op.create_index('idx_place_name', 'place', ['name'])

    # 3. Routing Graph (Segment)
    segment_kind = sa.Enum('footpath', 'crossing', 'entrance_link', 'stairs', 'ramp', name='segment_kind', create_type=True)

    op.create_table(
        'segment',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('kind', segment_kind, nullable=False),
        sa.Column('geom', Geometry(geometry_type='LINESTRING', srid=4326), nullable=False),
        sa.Column('from_node', sa.BigInteger(), nullable=False),
        sa.Column('to_node', sa.BigInteger(), nullable=False),
        sa.Column('osm_way_id', sa.BigInteger(), nullable=True),
        sa.Column('length_m', sa.Float(), nullable=False),
        sa.Column('cost', sa.Float(), nullable=False),
        sa.Column('reverse_cost', sa.Float(), nullable=False)
    )
    op.create_index('idx_segment_nodes', 'segment', ['from_node', 'to_node'])

    # 4. Feature
    feature_type = sa.Enum(
        'entrance', 'ramp', 'lift', 'toilet', 'counter',
        'signage', 'tactile_path', 'comm_support', 'crossing', 'kerb', 'bus_stop_platform',
        name='feature_type',
        create_type=True
    )

    op.create_table(
        'feature',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('place_id', UUID(as_uuid=True), sa.ForeignKey('place.id', ondelete='CASCADE'), nullable=True),
        sa.Column('segment_id', UUID(as_uuid=True), sa.ForeignKey('segment.id', ondelete='CASCADE'), nullable=True),
        sa.Column('type', feature_type, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('geom', Geometry(geometry_type='POINT', srid=4326), nullable=True),
        sa.Column('floor_level', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('(place_id IS NOT NULL) OR (segment_id IS NOT NULL)', name='chk_feature_has_parent')
    )
    op.create_index('idx_feature_place', 'feature', ['place_id'])
    op.create_index('idx_feature_segment', 'feature', ['segment_id'])
    op.create_index('idx_feature_type', 'feature', ['type'])

    # 5. AttributeDef
    attr_value_type = sa.Enum('number', 'boolean', 'string', 'enum', name='attr_value_type', create_type=True)

    op.create_table(
        'attribute_def',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('feature_type', sa.Enum('entrance', 'ramp', 'lift', 'toilet', 'counter', 'signage', 'tactile_path', 'comm_support', 'crossing', 'kerb', 'bus_stop_platform', name='feature_type', create_type=False), nullable=False),
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('value_type', attr_value_type, nullable=False),
        sa.Column('unit', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.UniqueConstraint('feature_type', 'key', name='uq_attribute_def_type_key')
    )

    # 6. UserAccount
    user_role = sa.Enum('auditor', 'verifier', 'moderator', 'admin', 'institution_admin', 'partner_ngo', name='user_role', create_type=True)

    op.create_table(
        'user_account',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', user_role, nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('idx_user_account_email', 'user_account', ['email'])

    # 7. Evidence with Core Safety Constraints
    evidence_label = sa.Enum('verified', 'reported', 'temporary_barrier', 'barrier', name='evidence_label', create_type=True)
    evidence_source = sa.Enum('auditor', 'user', 'osm', 'ai', 'import', name='evidence_source', create_type=True)
    evidence_status = sa.Enum('pending', 'approved', 'rejected', name='evidence_status', create_type=True)

    op.create_table(
        'evidence',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('feature_id', UUID(as_uuid=True), sa.ForeignKey('feature.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attribute_key', sa.String(100), nullable=False),
        sa.Column('value', JSONB, nullable=False),
        sa.Column('label', evidence_label, nullable=False),
        sa.Column('source', evidence_source, nullable=False),
        sa.Column('observer_id', UUID(as_uuid=True), sa.ForeignKey('user_account.id', ondelete='SET NULL'), nullable=True),
        sa.Column('verifier_id', UUID(as_uuid=True), sa.ForeignKey('user_account.id', ondelete='SET NULL'), nullable=True),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('photo_ids', ARRAY(UUID(as_uuid=True)), server_default='{}', nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('status', evidence_status, server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        
        # RULE 3: AI output can NEVER be verified
        sa.CheckConstraint("NOT (source = 'ai' AND label = 'verified')", name='chk_evidence_ai_never_verified'),
        # RULE 4: Collector is NOT verifier
        sa.CheckConstraint("verifier_id IS NULL OR verifier_id <> observer_id", name='chk_evidence_verifier_not_observer'),
        # RULE 4: Verified label requires a verifier
        sa.CheckConstraint("label <> 'verified' OR verifier_id IS NOT NULL", name='chk_evidence_verified_requires_verifier'),
        # Expiry must be after observation
        sa.CheckConstraint("expires_at > observed_at", name='chk_evidence_expiry_after_observed')
    )
    op.create_index('idx_evidence_feature_attr', 'evidence', ['feature_id', 'attribute_key'])
    op.create_index('idx_evidence_expires', 'evidence', ['expires_at'])
    op.create_index('idx_evidence_status', 'evidence', ['status'])

    # 8. NeedRule
    rule_operator = sa.Enum('eq', 'neq', 'lte', 'gte', 'in', 'not_in', name='rule_operator', create_type=True)

    op.create_table(
        'need_rule',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('need_code', sa.String(100), nullable=False),
        sa.Column('feature_type', sa.Enum('entrance', 'ramp', 'lift', 'toilet', 'counter', 'signage', 'tactile_path', 'comm_support', 'crossing', 'kerb', 'bus_stop_platform', name='feature_type', create_type=False), nullable=False),
        sa.Column('attribute_key', sa.String(100), nullable=False),
        sa.Column('operator', rule_operator, nullable=False),
        sa.Column('threshold', JSONB, nullable=False),
        sa.Column('critical', sa.Boolean(), server_default='true', nullable=False)
    )
    op.create_index('idx_need_rule_code', 'need_rule', ['need_code'])

    # 9. UserReport
    op.create_table(
        'user_report',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('feature_id', UUID(as_uuid=True), sa.ForeignKey('feature.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attribute_key', sa.String(100), nullable=False),
        sa.Column('value', JSONB, nullable=False),
        sa.Column('photo_ids', ARRAY(UUID(as_uuid=True)), server_default='{}', nullable=False),
        sa.Column('anonymous_token', sa.String(255), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('status', sa.String(50), server_default='open', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('idx_user_report_feature', 'user_report', ['feature_id', 'attribute_key'])
    op.create_index('idx_user_report_token', 'user_report', ['anonymous_token'])

    # 10. Suggestion
    suggestion_kind = sa.Enum('triage', 'photo_tag', 'duplicate', 'stale_prediction', 'conflict_score', name='suggestion_kind', create_type=True)
    suggestion_status = sa.Enum('open', 'accepted', 'dismissed', name='suggestion_status', create_type=True)

    op.create_table(
        'suggestion',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('kind', suggestion_kind, nullable=False),
        sa.Column('payload', JSONB, nullable=False),
        sa.Column('target_id', UUID(as_uuid=True), nullable=False),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('status', suggestion_status, server_default='open', nullable=False),
        sa.Column('reviewed_by', UUID(as_uuid=True), sa.ForeignKey('user_account.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('idx_suggestion_target', 'suggestion', ['target_id'])
    op.create_index('idx_suggestion_status', 'suggestion', ['status'])

    # 11. Photo
    op.create_table(
        'photo',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('storage_key', sa.String(500), nullable=False),
        sa.Column('blurred', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('consent_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )

    # 12. Escalation
    op.create_table(
        'escalation',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('feature_id', UUID(as_uuid=True), sa.ForeignKey('feature.id', ondelete='SET NULL'), nullable=True),
        sa.Column('evidence_id', UUID(as_uuid=True), sa.ForeignKey('evidence.id', ondelete='SET NULL'), nullable=True),
        sa.Column('authority', sa.String(255), nullable=False),
        sa.Column('forwarded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deadline', sa.DateTime(timezone=True), nullable=False),
        sa.Column('public_status', sa.String(100), nullable=False),
        sa.Column('public_note', sa.Text(), nullable=True)
    )

    # 13. AuditLog (Append-Only)
    op.create_table(
        'audit_log',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('actor_id', UUID(as_uuid=True), sa.ForeignKey('user_account.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity', sa.String(100), nullable=False),
        sa.Column('entity_id', UUID(as_uuid=True), nullable=False),
        sa.Column('before', JSONB, nullable=True),
        sa.Column('after', JSONB, nullable=True),
        sa.Column('at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('idx_audit_log_entity', 'audit_log', ['entity', 'entity_id'])
    op.create_index('idx_audit_log_at', 'audit_log', ['at'])

    # Append-Only Security Invariant: Revoke UPDATE and DELETE on audit_log
    op.execute("REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;")

    # 14. Setting
    op.create_table(
        'setting',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', JSONB, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )

    # 15. MetricEvent (Anonymous only)
    op.create_table(
        'metric_event',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('anonymous_session', sa.String(255), nullable=False),
        sa.Column('props', JSONB, server_default='{}', nullable=False),
        sa.Column('at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)
    )
    op.create_index('idx_metric_event_name_at', 'metric_event', ['name', 'at'])


def downgrade() -> None:
    op.drop_table('metric_event')
    op.drop_table('setting')
    op.drop_table('audit_log')
    op.drop_table('escalation')
    op.drop_table('photo')
    op.drop_table('suggestion')
    op.drop_table('user_report')
    op.drop_table('need_rule')
    op.drop_table('evidence')
    op.drop_table('user_account')
    op.drop_table('attribute_def')
    op.drop_table('feature')
    op.drop_table('segment')
    op.drop_table('place')
    op.drop_table('ward')

    op.execute('DROP TYPE IF EXISTS suggestion_status;')
    op.execute('DROP TYPE IF EXISTS suggestion_kind;')
    op.execute('DROP TYPE IF EXISTS rule_operator;')
    op.execute('DROP TYPE IF EXISTS evidence_status;')
    op.execute('DROP TYPE IF EXISTS evidence_source;')
    op.execute('DROP TYPE IF EXISTS evidence_label;')
    op.execute('DROP TYPE IF EXISTS user_role;')
    op.execute('DROP TYPE IF EXISTS attr_value_type;')
    op.execute('DROP TYPE IF EXISTS feature_type;')
    op.execute('DROP TYPE IF EXISTS segment_kind;')
    op.execute('DROP TYPE IF EXISTS place_type;')
