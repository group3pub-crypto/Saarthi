import sys
from pathlib import Path
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add apps/api and project root to sys.path so tests can be run from anywhere
api_dir = Path(__file__).resolve().parent.parent
root_dir = api_dir.parent.parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from app.config import settings
from app.database import Base

# Engine for test database
test_db_url = settings.TEST_DATABASE_URL or settings.DATABASE_URL
engine = create_engine(test_db_url, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _seed_standard_need_rules():
    """Make sure the standard need rules exist in the test database.

    Journey evaluation can only assess a feature when a rule applies to it. Without
    the standard rules nothing is assessed, which (correctly) never confirms a journey.
    Seeding is idempotent and only adds missing rules.
    """
    import importlib.util

    seed_path = root_dir / "scripts" / "seed_base_definitions.py"
    spec = importlib.util.spec_from_file_location("seed_base_definitions", seed_path)
    seed_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed_module)

    session = TestingSessionLocal()
    try:
        seed_module.seed_need_rules(session)
    finally:
        session.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Ensure all tables are created in the test database."""
    Base.metadata.create_all(bind=engine)
    _seed_standard_need_rules()
    yield


@pytest.fixture(scope="function")
def db_session():
    """Provide a transactional database session rolled back after every test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database import get_db

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

