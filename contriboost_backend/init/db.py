import asyncpg
from config.settings import settings
db_pool = None
async def init_db():
    global db_pool
    db_pool = await asyncpg.create_pool(
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
        host=settings.POSTGRES_HOST,
        port=5432
    )
    async with db_pool.acquire() as conn:
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender TEXT NOT NULL,
                contract_address TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp BIGINT NOT NULL,
                edited BOOLEAN DEFAULT FALSE
            )
        ''')
async def close_db():
    if db_pool:
        await db_pool.close()
