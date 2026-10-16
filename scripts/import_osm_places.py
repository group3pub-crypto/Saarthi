"""
SAARTHI Access - OSM Public Places Importer
Extracts real public-service places (hospitals, clinics, courts, transport hubs, municipal offices)
from clipped OpenStreetMap data into the `place` table with source='osm' and OSM ID stored.
Honors Section 10 rule: zero accessibility evidence on import so every accessibility status starts as Unknown.
"""

import sys
import os
import json
import argparse
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy import select, func

# Ensure apps/api is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from app.database import SessionLocal
from app.models.place import Ward, Place, PlaceType
from app.config import settings


def classify_osm_place_type(props: Dict[str, Any]) -> Optional[PlaceType]:
    """Map OSM tags to SAARTHI PlaceType enum."""
    amenity = props.get("amenity")
    healthcare = props.get("healthcare")
    office = props.get("office")
    railway = props.get("railway")
    public_transport = props.get("public_transport")

    if amenity in ["hospital", "clinic", "doctors"] or healthcare in ["hospital", "clinic"]:
        return PlaceType.HOSPITAL
    elif amenity == "courthouse":
        return PlaceType.COURT
    elif amenity == "townhall" or office in ["government", "administrative", "public"]:
        return PlaceType.MUNICIPAL_OFFICE
    elif amenity == "bus_station" or public_transport == "station" or railway in ["station", "halt"]:
        return PlaceType.TRANSPORT_HUB
    elif amenity in ["police", "post_office", "community_centre", "social_facility"]:
        return PlaceType.OTHER
    return None


def extract_representative_point(geom_dict: Dict[str, Any]) -> Optional[Point]:
    """Convert any GeoJSON geometry to a representative Point."""
    try:
        geom = shape(geom_dict)
        if geom.is_empty:
            return None
        if isinstance(geom, Point):
            return geom
        # For polygons / linestrings, use centroid or point_on_surface
        return geom.point_on_surface()
    except Exception:
        return None


def import_osm_places_from_geojson(geojson_path: Path, db) -> Dict[str, int]:
    """
    Import public-service places from GeoJSON file generated from OSM.
    """
    if not geojson_path.exists():
        raise FileNotFoundError(
            f"OSM Places GeoJSON file not found at '{geojson_path}'.\n"
            f"Run scripts/import_osm.sh first to generate the clipped dataset."
        )

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise ValueError(f"Malformed or unreadable GeoJSON file at '{geojson_path}': {e}") from e

    features = data.get("features", [])
    if not features:
        print(f"[!] Warning: No features found in {geojson_path.name}")
        return {"added": 0, "skipped_unnamed": 0, "skipped_existing": 0}

    print(f"[*] Processing {len(features)} OSM features from {geojson_path.name}...")

    # Preload wards for fast in-memory spatial linking
    wards = db.query(Ward).all()
    ward_polys = [(w.id, to_shape(w.geom)) for w in wards]

    # Preload existing OSM IDs to maintain strict idempotency
    existing_osm_ids = {row[0] for row in db.query(Place.osm_id).filter(Place.osm_id.isnot(None)).all()}

    stats = {
        "added": 0,
        "skipped_unnamed": 0,
        "skipped_unclassified": 0,
        "skipped_existing": 0,
        "by_type": {}
    }

    batch_size = 500
    pending_places = []

    for feat in features:
        props = feat.get("properties", {})
        geom_dict = feat.get("geometry")

        if not geom_dict:
            continue

        # Extract name (prefer English or primary name)
        name = props.get("name:en") or props.get("name")
        if not name or not name.strip():
            stats["skipped_unnamed"] += 1
            continue
        name = name.strip()

        # Classify place type
        place_type = classify_osm_place_type(props)
        if not place_type:
            stats["skipped_unclassified"] += 1
            continue

        # Extract integer OSM ID
        raw_osm_id = props.get("@id") or feat.get("id")
        osm_id: Optional[int] = None
        if raw_osm_id:
            cleaned_id = str(raw_osm_id).lstrip("nwr")
            try:
                osm_id = int(cleaned_id)
            except ValueError:
                pass

        # Check idempotency
        if osm_id and osm_id in existing_osm_ids:
            stats["skipped_existing"] += 1
            continue

        # Get point coordinates
        point = extract_representative_point(geom_dict)
        if not point or not (-180.0 <= point.x <= 180.0 and -90.0 <= point.y <= 90.0):
            continue

        wkt_point = from_shape(point, srid=4326)

        # Spatial check with wards
        enclosing_ward_id = None
        for w_id, w_poly in ward_polys:
            if w_poly.contains(point):
                enclosing_ward_id = w_id
                break

        # Address construction
        addr_parts = []
        if props.get("addr:housenumber"):
            addr_parts.append(props["addr:housenumber"])
        if props.get("addr:street"):
            addr_parts.append(props["addr:street"])
        if props.get("addr:suburb"):
            addr_parts.append(props["addr:suburb"])
        if props.get("addr:city"):
            addr_parts.append(props["addr:city"])
        
        address_str = ", ".join(addr_parts) if addr_parts else f"{name}, Pune"

        phone = props.get("phone") or props.get("contact:phone")
        hours = props.get("opening_hours")
        department = props.get("operator") or props.get("branch") or props.get("operator:type")

        new_place = Place(
            name=name[:255],
            type=place_type,
            address=address_str,
            geom=wkt_point,
            department=department[:255] if department else None,
            phone=phone[:50] if phone else None,
            hours=hours[:255] if hours else None,
            source="osm",
            ward_id=enclosing_ward_id,
            osm_id=osm_id
        )

        pending_places.append(new_place)
        if osm_id:
            existing_osm_ids.add(osm_id)

        stats["added"] += 1
        stats["by_type"][place_type.value] = stats["by_type"].get(place_type.value, 0) + 1

        if len(pending_places) >= batch_size:
            db.bulk_save_objects(pending_places)
            db.commit()
            pending_places.clear()
            print(f"  ...imported {stats['added']} OSM places so far")

    if pending_places:
        db.bulk_save_objects(pending_places)
        db.commit()
        pending_places.clear()

    print(f"[+] OSM Places import complete: {stats['added']} added, "
          f"{stats['skipped_existing']} existing skipped, "
          f"{stats['skipped_unnamed']} unnamed skipped.")
    print(f"    Categories breakdown: {stats['by_type']}")
    return stats


def main():
    parser = argparse.ArgumentParser(description="Import real public-service places from OpenStreetMap GeoJSON")
    parser.add_argument("--file", type=str, default="data/raw/pune_places.geojson", help="Path to OSM places GeoJSON")
    args = parser.parse_args()

    geojson_path = Path(args.file)
    db = SessionLocal()
    try:
        import_osm_places_from_geojson(geojson_path, db)
        print("[SUCCESS] OSM places imported successfully with initial 'Unknown' status (zero dummy evidence).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
