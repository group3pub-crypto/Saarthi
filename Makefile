.PHONY: up down migrate create-admin test lint import-all clean

PYTHON ?= apps/api/.venv/Scripts/python.exe
ALEMBIC ?= apps/api/.venv/Scripts/alembic.exe
PYTEST ?= apps/api/.venv/Scripts/pytest.exe

up:
	docker compose up -d

down:
	docker compose down

migrate:
	PYTHONPATH=apps/api $(ALEMBIC) -c apps/api/alembic.ini upgrade head

create-admin:
	PYTHONPATH=apps/api $(PYTHON) scripts/create_admin.py

seed-rules:
	PYTHONPATH=apps/api $(PYTHON) scripts/seed_base_definitions.py

ifeq ($(OS),Windows_NT)
    SH_RUN ?= wsl.exe -d Ubuntu -e /bin/bash
else
    SH_RUN ?= bash
endif

import-all:
	@echo "=== [1/4] Seeding Base Definitions & Need Rules ==="
	PYTHONPATH=apps/api $(PYTHON) scripts/seed_base_definitions.py
	@echo "=== [2/4] Importing Official Places CSV ==="
	PYTHONPATH=apps/api $(PYTHON) scripts/import_places_csv.py
	@echo "=== [3/4] Importing OpenCity PMC Wards & Bus Stops KML ==="
	PYTHONPATH=apps/api $(PYTHON) scripts/import_kml.py
	@echo "=== [4/4] Importing OpenStreetMap Segments & Public Places ==="
	$(SH_RUN) scripts/import_osm.sh
	@echo "=== All Real Open Data Imports Completed Successfully ==="

test:
	PYTHONPATH=apps/api $(PYTEST) apps/api/tests -v

test-coverage:
	PYTHONPATH=apps/api $(PYTEST) apps/api/tests -v --cov=app --cov-report=term-missing

lint:
	@echo "Running lint checks..."

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
