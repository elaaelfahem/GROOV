from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ollama_url: str = "http://localhost:11434/api/generate"
    model_name: str = "llama3.2:3b"
    max_persona_turns: int = 3
    did_api_key: str = "ZWxhLmVsZmFoZW1AZW5zdGFiLnVjYXIudG4:uU17LFvS8o11WGt_ll0yb"

    class Config:
        env_file = ".env"


settings = Settings()