import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv("../rag-service/.env")
client = OpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
    max_retries=0,  # fail straight away instead of waiting
)
try:
    client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": "hi"}],
        max_tokens=20,
    )
    print("OK: the limit has reset, you can run score_answers.py")
except Exception as e:
    print(e)