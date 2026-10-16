import uuid
from enum import Enum
from sqlalchemy import Column, BigInteger, Float, Enum as SQLEnum, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.database import Base


class SegmentKind(str, Enum):
    FOOTPATH = "footpath"
    CROSSING = "crossing"
    ENTRANCE_LINK = "entrance_link"
    STAIRS = "stairs"
    RAMP = "ramp"


class Segment(Base):
    __tablename__ = "segment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gid = Column(BigInteger, server_default=text("nextval('segment_gid_seq')"), unique=True, index=True)
    kind = Column(SQLEnum(SegmentKind, name="segment_kind", values_callable=lambda obj: [e.value for e in obj]), nullable=False, index=True)
    geom = Column(Geometry(geometry_type="LINESTRING", srid=4326), nullable=False)
    from_node = Column(BigInteger, nullable=False, index=True)
    to_node = Column(BigInteger, nullable=False, index=True)
    osm_way_id = Column(BigInteger, nullable=True)
    length_m = Column(Float, nullable=False)
    cost = Column(Float, nullable=False)
    reverse_cost = Column(Float, nullable=False)

    features = relationship("Feature", back_populates="segment", cascade="all, delete-orphan")
