from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Application
    app_name: str = "Wyoming AI Judge"
    debug: bool = False

    # Database — no default credentials; must be set via DATABASE_URL env var or .env
    database_url: str = ""

    # LLM API Keys
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # LLM Models
    extraction_model: str = "gpt-4o"
    reasoning_model: str = "claude-sonnet-4-20250514"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # File Storage
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 10

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # Auth / Roles
    admin_api_keys: list[str] = []

    # Field-level encryption for PII (names, addresses, phones)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    field_encryption_key: str = ""

    # Session cleanup
    session_max_idle_days: int = 30  # purge sessions inactive for this many days
    session_cleanup_interval_hours: int = 6  # how often the cleanup task runs

    # Rate Limiting
    max_cases_per_session: int = 20
    max_judgments_per_hour: int = 10
    judgment_requests_per_minute: int = 30
    corpus_search_requests_per_minute: int = 120
    corpus_ingest_requests_per_hour: int = 4

    # Retry / resilience
    llm_max_retries: int = 2
    llm_retry_base_delay_ms: int = 300
    llm_retry_max_delay_ms: int = 3000
    llm_call_timeout_seconds: int = 120  # hard timeout per individual LLM call

    model_config = {
        "env_file": ("../.env", ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
