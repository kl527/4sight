from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "FORESIGHT_"}

    poke_api_key: str = ""


settings = Settings()
