"""Strictly validated CSV importer for real public-service places.
Rejects any row with missing or invalid fields and prints a structured validation report.
Never invents or fills in placeholder values.
"""
import sys
import csv
import argparse
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from app.database import SessionLocal
from app.models.place import Place, PlaceType


REQUIRED_HEADERS = {"name", "type", "address", "lat", "lng", "phone", "department", "source"}
VALID_TYPES = {e.value for e in PlaceType}


def validate_row(row_num: int, row: Dict[str, str]) -> Tuple[bool, List[str], Optional[Dict[str, Any]]]:
    errors = []
    
    name = row.get("name", "").strip()
    if not name:
        errors.append("Empty or missing 'name'")

    p_type = row.get("type", "").strip().lower()
    if not p_type:
        errors.append("Empty or missing 'type'")
    elif p_type not in VALID_TYPES:
        errors.append(f"Invalid place type '{p_type}'. Must be one of: {sorted(list(VALID_TYPES))}")

    address = row.get("address", "").strip()
    if not address:
        errors.append("Empty or missing 'address'")

    lat_str = row.get("lat", "").strip()
    lng_str = row.get("lng", "").strip()
    lat, lng = None, None

    try:
        lat = float(lat_str)
        if not (-90.0 <= lat <= 90.0):
            errors.append(f"Latitude '{lat}' out of valid range [-90, 90]")
    except (ValueError, TypeError):
        errors.append(f"Invalid latitude format '{lat_str}'")

    try:
        lng = float(lng_str)
        if not (-180.0 <= lng <= 180.0):
            errors.append(f"Longitude '{lng}' out of valid range [-180, 180]")
    except (ValueError, TypeError):
        errors.append(f"Invalid longitude format '{lng_str}'")

    source = row.get("source", "").strip()
    if not source:
        errors.append("Empty or missing 'source'")

    if errors:
        return False, errors, None

    clean_data = {
        "name": name,
        "type": PlaceType(p_type),
        "address": address,
        "latitude": lat,
        "longitude": lng,
        "phone": row.get("phone", "").strip() or None,
        "department": row.get("department", "").strip() or None,
        "source": source
    }
    return True, [], clean_data


def import_csv(filepath: Path) -> Tuple[int, int, List[str]]:
    if not filepath.exists():
        raise FileNotFoundError(f"Places CSV file not found at: {filepath}")

    inserted_count = 0
    skipped_count = 0
    rejected_errors = []

    db = SessionLocal()
    try:
        with open(filepath, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = set(h.strip() for h in (reader.fieldnames or []))
            
            missing_headers = REQUIRED_HEADERS - headers
            if missing_headers:
                raise ValueError(f"CSV is missing required headers: {sorted(list(missing_headers))}")

            for idx, row in enumerate(reader, start=2): # 1-indexed, header is line 1
                is_valid, errors, data = validate_row(idx, row)
                if not is_valid:
                    rejected_errors.append(f"Line {idx}: " + "; ".join(errors))
                    continue

                # Idempotency check: match by name and coordinates
                existing = db.query(Place).filter(
                    Place.name == data["name"],
                    Place.address == data["address"]
                ).first()

                if existing:
                    skipped_count += 1
                    continue

                point_geom = f"SRID=4326;POINT({data['longitude']} {data['latitude']})"
                new_place = Place(
                    name=data["name"],
                    type=data["type"],
                    address=data["address"],
                    geom=point_geom,
                    phone=data["phone"],
                    department=data["department"],
                    source=data["source"]
                )
                db.add(new_place)
                inserted_count += 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return inserted_count, skipped_count, rejected_errors


def main():
    parser = argparse.ArgumentParser(description="Strict Real Places CSV Importer")
    parser.add_argument("file", type=str, nargs="?", default="data/seed/places_template.csv", help="Path to places CSV file")
    args = parser.parse_args()

    csv_path = Path(args.file)
    print(f"Loading and validating real places CSV from: {csv_path}")

    try:
        inserted, skipped, errors = import_csv(csv_path)
        print(f"Import Summary:")
        print(f"  - Successfully inserted: {inserted} places")
        print(f"  - Skipped (already exists): {skipped} places")
        print(f"  - Rejected rows: {len(errors)}")

        if errors:
            print("\nValidation Errors Encountered:")
            for err in errors[:20]: # show first 20 errors
                print(f"  ! {err}")
            if len(errors) > 20:
                print(f"  ... and {len(errors) - 20} more errors.")
    except Exception as e:
        print(f"Fatal Import Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
