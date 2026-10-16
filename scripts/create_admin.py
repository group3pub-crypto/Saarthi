"""Bootstrap script to create the initial system administrator account.
Prompts interactively for email and password. No default credentials.
"""
import sys
import getpass
import argparse
import re
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from app.database import SessionLocal
from app.models.operations import UserAccount, UserRole
from app.core.security import hash_password
from app.core.audit import record_audit_log


def validate_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email))


def main():
    parser = argparse.ArgumentParser(description="Bootstrap SAARTHI Access Admin Account")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--password", help="Admin password (minimum 8 characters)")
    args = parser.parse_args()

    email = args.email
    if not email:
        email = input("Enter admin email: ").strip()

    if not validate_email(email):
        print(f"Error: Invalid email format '{email}'", file=sys.stderr)
        sys.exit(1)

    password = args.password
    if not password:
        password = getpass.getpass("Enter admin password (min 8 chars): ")
        password_confirm = getpass.getpass("Confirm admin password: ")
        if password != password_confirm:
            print("Error: Passwords do not match", file=sys.stderr)
            sys.exit(1)

    if len(password) < 8:
        print("Error: Password must be at least 8 characters long", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(UserAccount).filter(UserAccount.email == email).first()
        if existing:
            print(f"User account '{email}' already exists. Updating to active admin role.")
            existing.role = UserRole.ADMIN
            existing.password_hash = hash_password(password)
            existing.is_active = True
            record_audit_log(
                db=db,
                action="update_admin",
                entity="user_account",
                entity_id=existing.id,
                after={"email": email, "role": "admin"}
            )
            db.commit()
            print(f"Admin '{email}' updated successfully.")
            return

        admin_user = UserAccount(
            email=email,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin_user)
        db.flush()

        record_audit_log(
            db=db,
            action="create_admin",
            entity="user_account",
            entity_id=admin_user.id,
            actor_id=admin_user.id,
            after={"email": email, "role": "admin"}
        )
        db.commit()
        print(f"Admin user '{email}' created successfully.")
    except Exception as e:
        db.rollback()
        print(f"Failed to create admin user: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
