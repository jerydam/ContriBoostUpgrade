import os
from dotenv import load_dotenv
load_dotenv()
class Settings:
    LISK_SEPOLIA_RPC_URL = os.getenv("LISK_SEPOLIA_RPC_URL")
    FACTORY_ADDRESS = os.getenv("FACTORY_ADDRESS")
    POSTGRES_USER = os.getenv("POSTGRES_USER")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
    POSTGRES_DB = os.getenv("POSTGRES_DB")
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
    CORS_ORIGINS = ["http://localhost:3000", "https://your-frontend.vercel.app"]
settings = Settings()
