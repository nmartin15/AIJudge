#!/bin/sh
set -e

echo "==> Waiting for database to accept connections..."
# Wait up to 30 seconds for Postgres to be ready
for i in $(seq 1 30); do
  if python -c "
import asyncio, sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine
async def check():
    e = create_async_engine('$DATABASE_URL', pool_pre_ping=True)
    async with e.begin() as conn:
        await conn.execute(sa.text('SELECT 1'))
    await e.dispose()
asyncio.run(check())
" 2>/dev/null; then
    echo "==> Database is ready."
    break
  fi
  if [ "$i" = "30" ]; then
    echo "==> WARNING: Database not reachable after 30s — continuing anyway."
    break
  fi
  echo "    ...waiting ($i/30)"
  sleep 1
done

echo "==> Running database migrations..."
alembic upgrade head
echo "==> Migrations complete."

echo "==> Starting application server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
