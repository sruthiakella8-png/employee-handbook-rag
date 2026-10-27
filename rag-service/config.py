import os

from dotenv import load_dotenv

load_dotenv()  # reads GROQ_API_KEY (and any overrides) from .env in this folder

# libpq connection string. With no user/password given, it falls back to your
# Mac username, which is how your local Homebrew Postgres is set up.
DATABASE_URL = os.getenv("DATABASE_URL", "dbname=handbook_db host=localhost")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # 384 dimensions, must match the Django model
TOP_K = int(os.getenv("TOP_K", "5"))
MIN_SIMILARITY = float(os.getenv("MIN_SIMILARITY", "0.20"))
DJANGO_SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
