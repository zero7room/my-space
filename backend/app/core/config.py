from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "my-space-backend"
    environment: str = "local"
    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/my_space",
        validation_alias="DATABASE_URL",
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
