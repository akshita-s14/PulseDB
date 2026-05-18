const { Pool, Client } = require('pg');
const config = require('./config');

// Pool for regular queries (INSERT, SELECT, UPDATE, DELETE)
// Pool automatically manages multiple connections
const pool = new Pool({ connectionString: config.databaseUrl });

pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error:', err.message);
});

/**
 * Creates a dedicated PostgreSQL client for LISTEN/NOTIFY.
 * A separate client is required — LISTEN mode blocks the connection
 * from running regular queries.
 *
 * @param {Function} onNotification - called with parsed JSON payload on each event
 * @returns {Client} the connected listener client
 */
async function createListenerClient(onNotification) {
  const client = new Client({ connectionString: config.databaseUrl });

  await client.connect();
  await client.query("LISTEN pulsedb_orders");
  console.log('[DB] Listening on channel: pulsedb_orders');

  client.on('notification', ({ channel, payload }) => {
    try {
      const parsed = JSON.parse(payload);
      onNotification(parsed);
    } catch (err) {
      console.error('[DB] Failed to parse notification payload:', err.message);
    }
  });

  // Reconnect on unexpected disconnect
  client.on('error', async (err) => {
    console.error('[DB] Listener error:', err.message);
    console.log('[DB] Attempting reconnect in 5s...');
    setTimeout(() => createListenerClient(onNotification), 5000);
  });

  return client;
}

module.exports = { pool, createListenerClient };
