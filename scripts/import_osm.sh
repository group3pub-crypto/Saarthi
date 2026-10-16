#!/usr/bin/env bash
# ==============================================================================
# SAARTHI Access - OpenStreetMap Data Importer Pipeline
# Downloads OSM India Western Zone extract (Geofabrik, ODbL), clips to bounding
# box defined in .env, extracts pedestrian routing network & public-service places,
# builds pgRouting topology, and populates PostgreSQL with real open data.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_RAW="${ROOT_DIR}/data/raw"

mkdir -p "${DATA_RAW}"

# 1. Parse BBOX from .env if present
BBOX="73.70,18.40,74.05,18.65"
if [ -f "${ROOT_DIR}/.env" ]; then
    ENV_BBOX=$(grep -E '^BBOX=' "${ROOT_DIR}/.env" | cut -d '=' -f2 | tr -d '"' | tr -d "'" || true)
    if [ -n "${ENV_BBOX}" ]; then
        BBOX="${ENV_BBOX}"
    fi
fi

echo "================================================================="
echo "SAARTHI Access: OpenStreetMap Data Import Pipeline"
echo "Geographic Bounding Box: ${BBOX}"
echo "Attribution: Map data © OpenStreetMap contributors (ODbL, Geofabrik)"
echo "================================================================="

OSM_PBF="${DATA_RAW}/western-zone-latest.osm.pbf"
CLIPPED_PBF="${DATA_RAW}/pune_clipped.osm.pbf"
PEDESTRIAN_GEOJSON="${DATA_RAW}/pune_pedestrian.geojson"
PLACES_GEOJSON="${DATA_RAW}/pune_places.geojson"

# 2. Download Western Zone extract if not already present
if [ ! -f "${OSM_PBF}" ]; then
    echo "[*] Downloading OSM India Western Zone extract from Geofabrik..."
    curl -L -C - -o "${OSM_PBF}" "https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf"
else
    echo "[+] Using existing OSM extract: ${OSM_PBF}"
fi

# 3. Clip to target BBOX using osmium
echo "[*] Clipping extract to BBOX (${BBOX})..."
osmium extract -b "${BBOX}" "${OSM_PBF}" -o "${CLIPPED_PBF}" --overwrite

# 4. Filter and export pedestrian network
echo "[*] Extracting pedestrian footpaths, crossings, steps, and ramps..."
osmium tags-filter "${CLIPPED_PBF}" \
    w/highway=footway,pedestrian,path,steps,crossing,corridor \
    -o "${DATA_RAW}/pune_pedestrian.osm.pbf" --overwrite

osmium export -u type_id -a type,id "${DATA_RAW}/pune_pedestrian.osm.pbf" \
    -o "${PEDESTRIAN_GEOJSON}" --overwrite

# 5. Filter and export public-service places
echo "[*] Extracting public-service places (hospitals, clinics, courts, municipal offices, stations)..."
osmium tags-filter "${CLIPPED_PBF}" \
    nwr/amenity=hospital,clinic,doctors,townhall,courthouse,police,post_office,bus_station \
    nwr/railway=station,halt \
    nwr/public_transport=station \
    nwr/office=government \
    -o "${DATA_RAW}/pune_places.osm.pbf" --overwrite

osmium export -u type_id -a type,id "${DATA_RAW}/pune_places.osm.pbf" \
    -o "${PLACES_GEOJSON}" --overwrite

# 6. Populate PostgreSQL database via Python loaders
echo "[*] Ingesting pedestrian segments & pgRouting topology into database..."
PYTHON_BIN="${ROOT_DIR}/apps/api/.venv/Scripts/python.exe"
if [ ! -f "${PYTHON_BIN}" ]; then
    PYTHON_BIN="python3"
fi

if [[ "${PYTHON_BIN}" == *.exe ]]; then
    SCRIPT_WIN=$(wslpath -w "${SCRIPT_DIR}/load_osm_segments.py")
    GEOJSON_WIN=$(wslpath -w "${PEDESTRIAN_GEOJSON}")
    "${PYTHON_BIN}" "${SCRIPT_WIN}" --file "${GEOJSON_WIN}"

    echo "[*] Ingesting real public places into database..."
    PLACES_SCRIPT_WIN=$(wslpath -w "${SCRIPT_DIR}/import_osm_places.py")
    PLACES_GEOJSON_WIN=$(wslpath -w "${PLACES_GEOJSON}")
    "${PYTHON_BIN}" "${PLACES_SCRIPT_WIN}" --file "${PLACES_GEOJSON_WIN}"
else
    "${PYTHON_BIN}" "${SCRIPT_DIR}/load_osm_segments.py" --file "${PEDESTRIAN_GEOJSON}"
    echo "[*] Ingesting real public places into database..."
    "${PYTHON_BIN}" "${SCRIPT_DIR}/import_osm_places.py" --file "${PLACES_GEOJSON}"
fi

echo "================================================================="
echo "[SUCCESS] OSM Import completed successfully."
echo "================================================================="
