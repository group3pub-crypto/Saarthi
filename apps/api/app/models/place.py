import uuid
from enum import Enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, ForeignKey, BigInteger, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.database import Base


class PlaceType(str, Enum):
    HOSPITAL = "hospital"
    MUNICIPAL_OFFICE = "municipal_office"
    TRANSPORT_HUB = "transport_hub"
    AADHAAR_CENTRE = "aadhaar_centre"
    RATION_CENTRE = "ration_centre"
    COURT = "court"
    BUS_STOP = "bus_stop"
    OTHER = "other"


class Ward(Base):
    __tablename__ = "ward"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    geom = Column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=False)

    places = relationship("Place", back_populates="ward", cascade="all, delete-orphan")


class Place(Base):
    __tablename__ = "place"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    type = Column(SQLEnum(PlaceType, name="place_type", values_callable=lambda obj: [e.value for e in obj]), nullable=False, index=True)
    address = Column(Text, nullable=False)
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    department = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    hours = Column(String(255), nullable=True)
    source = Column(String(100), nullable=False)
    ward_id = Column(UUID(as_uuid=True), ForeignKey("ward.id", ondelete="SET NULL"), nullable=True)
    osm_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    ward = relationship("Ward", back_populates="places")
    features = relationship("Feature", back_populates="place", cascade="all, delete-orphan")
