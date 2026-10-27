import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates (avoids timezone shifts).
pg.types.setTypeParser(1082, (value) => value);

export function createPool(dbConfig, { log = console.log } = {}) {
  const pool = new pg.Pool({
    ...dbConfig,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // When PostgreSQL stops it closes our idle connections. Without this listener Node treats that
  // as an unhandled 'error' event and the whole API crashes; with it, the API keeps running,
  // /api/health reports 503, and the pool reconnects once the database is back.
  pool.on('error', (error) => log(`Idle database connection lost: ${error.code || error.message}`));
  return pool;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The database may still be starting even after the healthcheck passes; retry like the lab's Flask app.
export async function waitForDatabase(pool, { attempts = 30, delayMs = 2000, log = console.log } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      log(`Database reachable (attempt ${attempt}/${attempts}).`);
      return;
    } catch (error) {
      log(`Database not ready (${attempt}/${attempts}): ${error.code || error.message}`);
      await sleep(delayMs);
    }
  }
  throw new Error('Could not connect to the database.');
}

export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
