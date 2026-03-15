from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ollama_url: str = "http://127.0.0.1:11434/api/generate"
    model_name: str = "llama3.2:3b"
    max_persona_turns: int = 3

    class Config:
        env_file = ".env"


settings = Settings()