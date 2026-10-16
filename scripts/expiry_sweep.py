#!/usr/bin/env python3
"""
SAARTHI Access - Hourly Evidence Expiry Sweep Script
Scans for expired accessibility evidence, records audit ledger events,
and prioritizes items in the re-audit queue.
"""

import sys
from pathlib import Path

# Add apps/api to path
api_dir = Path(__file__).resolve().parent.parent / "apps" / "api"
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from app.database import SessionLocal
from app.services.expiry_sweep import run_expiry_sweep


def main():
    print("[*] Starting SAARTHI Access Evidence Expiry Sweep...")
    db = SessionLocal()
    try:
        result = run_expiry_sweep(db)
        print(f"[+] Expiry sweep completed at {result['timestamp']}")
        print(f"[+] Total expired evidence records: {result['expired_count']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
