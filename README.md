# SAARTHI Access

> **Disability-First Public Journey Accessibility Platform**
> Deterministic readiness evaluations, real evidence decay tracking, privacy-by-design, and zero dummy data.

---

## 1. Core Principles
- **Unknown is never accessible**: If evidence is missing, expired, or pending, status is `Unknown`. Any critical `Unknown` or `Barrier` prevents a journey from being confirmed accessible.
- **Evidence expires**: Every observation has an `observed_at` and query-time `expires_at`.
- **AI never verifies**: AI generates non-binding suggestions only (`source='ai'` can never have `label='verified'`).
- **Collector is not verifier**: Audits require independent verifier approval (`verifier_id <> observer_id`).
- **Privacy by design**: User accessibility profiles remain stored locally in the browser (`IndexedDB`). Only anonymous need codes are transmitted.
- **Append-only audit log**: All database modifications are recorded in an append-only log with database-level triggers blocking `UPDATE` and `DELETE`.

---

## 2. Quickstart

### Prerequisites
- Python 3.11+ / 3.12
- Node.js 20+
- PostgreSQL 16+ with PostGIS 3+ and pgRouting 3.4+
- Redis 7+

### 1. Setup Environment
```bash
cp .env.example .env
```

### 2. Install Backend Dependencies
```bash
python -m venv apps/api/.venv
# On Windows:
apps/api/.venv/Scripts/pip install -r apps/api/requirements.txt
# On Linux/macOS:
source apps/api/.venv/bin/activate && pip install -r apps/api/requirements.txt
```

### 3. Run Database Migrations
```bash
make migrate
```

### 4. Create Initial Administrator
```bash
make create-admin
```
Prompts securely for an email and an 8+ character password. No default credentials exist.

### 5. Run Tests
```bash
make test
```

---

## 3. Data Licensing & Disclaimers
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
- Administrative boundaries from OpenCity (PMC).
- See [LIMITATIONS.md](file:///c:/Users/amogh/Documents/GitHub/Saarthi-access/docs/LIMITATIONS.md) and [DATA_SOURCES.md](file:///c:/Users/amogh/Documents/GitHub/Saarthi-access/docs/DATA_SOURCES.md).
