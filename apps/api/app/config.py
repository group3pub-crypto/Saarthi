from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "SAARTHI Access"
    ENV: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://saarthi:saarthi_dev_pw@localhost:5433/saarthi_db"
    TEST_DATABASE_URL: Optional[str] = "postgresql+psycopg2://saarthi:saarthi_dev_pw@localhost:5433/saarthi_test_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security & Staff JWT Auth
    SECRET_KEY: str = "saarthi_insecure_development_secret_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Storage (S3 / MinIO)
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "saarthi-photos"
    S3_REGION: str = "us-east-1"
    S3_SECURE: bool = False

    # Assistive AI Provider (None / openai / anthropic / gemini)
    AI_PROVIDER: str = "openai"
    AI_API_KEY: Optional[str] = None
    AI_MODEL: str = "gpt-4o"

    # SMS / IVR Provider (twilio / exotel)
    SMS_PROVIDER: str = "twilio"
    SMS_ACCOUNT_SID: Optional[str] = None
    SMS_AUTH_TOKEN: Optional[str] = None
    SMS_PHONE_NUMBER: Optional[str] = None

    # Geo bounding box (min_lon,min_lat,max_lon,max_lat)
    BBOX: str = "73.70,18.40,74.05,18.65"
    DEFAULT_WARD_CODE: str = "PMC"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
