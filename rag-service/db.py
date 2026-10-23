from pgvector.psycopg import register_vector
from psycopg_pool import ConnectionPool

import config

# A small pool of reusable connections. open=False means we open it explicitly
# when the app starts (see lifespan in main.py).
# register_vector teaches psycopg how to send/receive pgvector's vector type,
# so we can pass numpy arrays straight into SQL.
pool = ConnectionPool(
    config.DATABASE_URL,
    min_size=1,
    max_size=5,
    configure=register_vector,
    open=False,
)
