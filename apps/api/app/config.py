from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AnyTech API"
    app_env: str = "development"
    database_url: str = "sqlite:///./anytech.sqlite3"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = Field(default="dev-only-change-this-secret-before-production", min_length=32)
    access_token_minutes: int = 15
    allowed_origins: str = "http://localhost:4200"
    cookie_secure: bool = False
    demo_mode: bool = True
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_phone_number_id: str = ""
    llm_provider: str = ""
    llm_model: str = ""
    llm_api_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_monthly_budget_minor: int = 0
    carrier_provider: str = ""
    carrier_api_key: str = ""

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
