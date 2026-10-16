"""
SAARTHI Access - OpenCity KML Importer
Imports administrative ward boundaries and real bus stops from Pune Municipal Corporation (PMC) KML files.
Validates input files, handles malformed structures loudly, links bus stops to enclosing wards spatially,
and maintains strict idempotency.
"""

import sys
import os
import argparse
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, List, Tuple
from shapely.geometry import Point, Polygon, MultiPolygon
from shapely import wkt
from geoalchemy2.shape import from_shape
from sqlalchemy import select, func

# Ensure apps/api is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from app.database import SessionLocal
from app.models.place import Ward, Place, PlaceType
from app.config import settings


KML_NS = "{http://www.opengis.net/kml/2.2}"


def parse_bbox(bbox_str: str) -> Tuple[float, float, float, float]:
    """Parse min_lon, min_lat, max_lon, max_lat from string."""
    parts = [float(p.strip()) for p in bbox_str.split(",")]
    if len(parts) != 4:
        raise ValueError(f"Invalid BBOX string: {bbox_str}. Expected min_lon,min_lat,max_lon,max_lat")
    return parts[0], parts[1], parts[2], parts[3]


def parse_coordinates_text(coord_text: str) -> List[Tuple[float, float]]:
    """Parse space-separated or newline-separated lon,lat,alt coordinate strings."""
    coords = []
    for raw in coord_text.strip().split():
        parts = raw.split(",")
        if len(parts) >= 2:
            try:
                lon = float(parts[0])
                lat = float(parts[1])
                coords.append((lon, lat))
            except ValueError:
                continue
    return coords


def import_wards(kml_path: Path, db) -> Tuple[int, int]:
    """
    Parse and import Ward boundaries from PMC KML file.
    Returns (wards_added, wards_updated).
    """
    if not kml_path.exists():
        raise FileNotFoundError(f"Wards KML file not found at: {kml_path}")

    try:
        tree = ET.parse(kml_path)
    except ET.ParseError as e:
        raise ValueError(f"Malformed XML in wards KML file '{kml_path}': {e}") from e

    root = tree.getroot()
    placemarks = root.findall(f".//{KML_NS}Placemark")
    if not placemarks:
        # Try without namespace in case KML doesn't define standard xmlns
        placemarks = root.findall(".//Placemark")

    if not placemarks:
        raise ValueError(f"No <Placemark> elements found in wards KML file '{kml_path}'. Invalid or empty KML.")

    added = 0
    updated = 0

    print(f"[*] Processing {len(placemarks)} ward placemarks from {kml_path.name}...")

    for pm in placemarks:
        # Find ward name
        name_el = pm.find(f"{KML_NS}name")
        if name_el is None or not name_el.text:
            name_el = pm.find(".//name")
        
        name = name_el.text.strip() if (name_el is not None and name_el.text) else None
        if not name:
            # Check ExtendedData/SimpleData
            for sd in pm.findall(f".//{KML_NS}SimpleData"):
                if sd.attrib.get("name") in ["ward_name", "WARD_NAME", "Name", "NAME"]:
                    name = sd.text.strip()
                    break

        if not name:
            continue

        # Find Polygon coordinates
        coord_els = pm.findall(f".//{KML_NS}Polygon//{KML_NS}coordinates")
        if not coord_els:
            coord_els = pm.findall(".//Polygon//coordinates")

        if not coord_els:
            continue

        # Build polygons
        polys = []
        for cel in coord_els:
            if not cel.text:
                continue
            pts = parse_coordinates_text(cel.text)
            if len(pts) >= 3:
                # Ensure closed ring
                if pts[0] != pts[-1]:
                    pts.append(pts[0])
                poly = Polygon(pts)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly.is_valid and not poly.is_empty:
                    polys.append(poly)

        if not polys:
            continue

        multi_poly = MultiPolygon(polys)
        geom_wkt = from_shape(multi_poly, srid=4326)

        # Check existing ward by name
        existing_ward = db.query(Ward).filter(Ward.name == name).first()
        if existing_ward:
            existing_ward.geom = geom_wkt
            updated += 1
        else:
            new_ward = Ward(
                name=name,
                geom=geom_wkt
            )
            db.add(new_ward)
            added += 1

    db.commit()
    print(f"[+] Wards import complete: {added} added, {updated} updated.")
    return added, updated


def import_bus_stops(kml_path: Path, db, bbox: Optional[Tuple[float, float, float, float]] = None) -> Tuple[int, int, int]:
    """
    Parse and import PMPML bus stops from KML.
    Returns (stops_added, stops_skipped_existing, stops_outside_bbox).
    """
    if not kml_path.exists():
        raise FileNotFoundError(f"Bus stops KML file not found at: {kml_path}")

    try:
        tree = ET.parse(kml_path)
    except ET.ParseError as e:
        raise ValueError(f"Malformed XML in bus stops KML file '{kml_path}': {e}") from e

    root = tree.getroot()
    placemarks = root.findall(f".//{KML_NS}Placemark")
    if not placemarks:
        placemarks = root.findall(".//Placemark")

    if not placemarks:
        raise ValueError(f"No <Placemark> elements found in bus stops KML file '{kml_path}'. Invalid or empty KML.")

    print(f"[*] Processing {len(placemarks)} bus stop placemarks from {kml_path.name}...")

    min_lon, min_lat, max_lon, max_lat = bbox if bbox else (-180.0, -90.0, 180.0, 90.0)

    # Preload all wards into shapely polygons for lightning-fast spatial assignment
    from geoalchemy2.shape import to_shape
    wards = db.query(Ward).all()
    ward_polys = [(w.id, to_shape(w.geom)) for w in wards]

    # Preload existing bus stop names for idempotency check
    existing_stop_names = {row[0] for row in db.query(Place.name).filter(Place.type == PlaceType.BUS_STOP).all()}

    added = 0
    skipped_existing = 0
    outside_bbox = 0

    batch_size = 500
    pending_places = []

    for pm in placemarks:
        # Extract attributes from SimpleData
        attrs = {}
        for sd in pm.findall(f".//{KML_NS}SimpleData"):
            key = sd.attrib.get("name")
            if key and sd.text:
                attrs[key] = sd.text.strip()

        stop_name = attrs.get("stop_name")
        stop_code = attrs.get("stop_code") or attrs.get("stop_id")

        if not stop_name:
            name_el = pm.find(f"{KML_NS}name") or pm.find(".//name")
            if name_el is not None and name_el.text:
                stop_name = name_el.text.strip()

        if not stop_name:
            continue

        # Extract coordinates with single // (ElementTree doesn't support chained //a//b)
        coord_el = pm.find(f".//{KML_NS}coordinates")
        if coord_el is None:
            coord_el = pm.find(".//coordinates")

        if coord_el is None or not coord_el.text:
            continue

        coords = parse_coordinates_text(coord_el.text)
        if not coords:
            continue

        lon, lat = coords[0]

        # Validate coordinate ranges
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            continue

        # Check bbox filter
        if not (min_lon <= lon <= max_lon and min_lat <= lat <= max_lat):
            outside_bbox += 1
            continue

        # Check idempotency
        if stop_name in existing_stop_names:
            skipped_existing += 1
            continue

        point_geom = Point(lon, lat)
        wkt_point = from_shape(point_geom, srid=4326)

        # In-memory spatial lookup for enclosing ward
        enclosing_ward_id = None
        for w_id, w_poly in ward_polys:
            if w_poly.contains(point_geom):
                enclosing_ward_id = w_id
                break

        address_str = f"Stop Code: {stop_code}, Pune" if stop_code else "PMPML Bus Stop, Pune"

        new_place = Place(
            name=stop_name,
            type=PlaceType.BUS_STOP,
            address=address_str,
            geom=wkt_point,
            department="PMPML (Pune Mahanagar Parivahan Mahamandal Ltd)",
            source="opencity_kml",
            ward_id=enclosing_ward_id
        )
        pending_places.append(new_place)
        existing_stop_names.add(stop_name)
        added += 1

        if len(pending_places) >= batch_size:
            db.bulk_save_objects(pending_places)
            db.commit()
            pending_places.clear()
            print(f"  ...imported {added} bus stops so far")

    if pending_places:
        db.bulk_save_objects(pending_places)
        db.commit()
        pending_places.clear()

    print(f"[+] Bus stops import complete: {added} added, {skipped_existing} existing skipped, {outside_bbox} outside BBOX.")
    return added, skipped_existing, outside_bbox


def main():
    parser = argparse.ArgumentParser(description="Import Pune Municipal Corporation Wards and Bus Stops from KML")
    parser.add_argument("--wards-file", type=str, default="data/raw/pune_administrative_wards.kml", help="Path to administrative wards KML")
    parser.add_argument("--stops-file", type=str, default="data/raw/pune_bus_stops.kml", help="Path to bus stops KML")
    parser.add_argument("--skip-wards", action="store_true", help="Skip wards import")
    parser.add_argument("--skip-stops", action="store_true", help="Skip bus stops import")

    args = parser.parse_args()

    wards_path = Path(args.wards_file)
    stops_path = Path(args.stops_file)

    if not args.skip_wards and not wards_path.exists():
        raise FileNotFoundError(
            f"Wards KML file missing at '{wards_path}'.\n"
            f"Please download official Pune Municipal Corporation wards KML from OpenCity into data/raw/."
        )

    if not args.skip_stops and not stops_path.exists():
        raise FileNotFoundError(
            f"Bus stops KML file missing at '{stops_path}'.\n"
            f"Please download official Pune PMPML bus stops KML from OpenCity into data/raw/."
        )

    db = SessionLocal()
    try:
        bbox = parse_bbox(settings.BBOX) if settings.BBOX else None
        print(f"[*] Geographic BBOX filter: {bbox}")

        if not args.skip_wards:
            import_wards(wards_path, db)

        if not args.skip_stops:
            import_bus_stops(stops_path, db, bbox=bbox)

        print("[SUCCESS] KML data import completed successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
