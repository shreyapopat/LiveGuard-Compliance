// Thin Postgres access layer. Kept deliberately small — this is a
// hackathon-scoped project, not a full data-access-object framework.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] unexpected error on idle client', err);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - start;
  if (ms > 200) console.warn(`[db] slow query (${ms}ms): ${text.slice(0, 80)}`);
  return res;
}

module.exports = { pool, query };
