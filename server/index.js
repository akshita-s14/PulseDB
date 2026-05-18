require('./config');  // Validates env vars — fail fast if missing
const http    = require('http');
const express = require('express');
const path    = require('path');
const config  = require('./config');
const { pool, createListenerClient } = require('./db');
const { createWsServer }             = require('./wsServer');
const ordersRouter                   = require('./routes/orders');
const adminRouter                    = require('./routes/admin');
const { publisher, subscriber }      = require('./redis');
const { setupMailer, sendOrderNotification } = require('./mailer');
const { recordEventForAI }           = require('./ai');
const { registry, eventsProcessed }  = require('./metrics');
const jwt                            = require('jsonwebtoken');

const app = express();
app.use(express.json());

// Prometheus Observability Endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Serve the browser client as a static file
app.use(express.static(path.join(__dirname, '..', 'client')));

// JWT Auth Endpoint for WebSockets
app.post('/api/auth/token', (req, res) => {
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'pulsedb_secret', { expiresIn: '1h' });
  res.json({ token });
});

// REST API routes
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

// Health check — important for Docker and load balancers
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');  // Verify DB is reachable
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

const CHANNEL = 'pulsedb:orders';
let httpServer;

async function main() {
  await setupMailer();
  httpServer = http.createServer(app);
  const { broadcast } = createWsServer(httpServer);

  if (publisher && subscriber) {
    // Multi-instance mode: use Redis as message bus
    // Any server instance publishes; ALL instances receive and broadcast to their own clients
    subscriber.subscribe(CHANNEL);
    subscriber.on('message', (_, msg) => broadcast(JSON.parse(msg)));

    // DB listener publishes to Redis (not directly to WS clients)
    await createListenerClient((event) => {
      eventsProcessed.inc();
      publisher.publish(CHANNEL, JSON.stringify(event));
      if (event.operation !== 'DELETE') sendOrderNotification(event.record);
      recordEventForAI(event, broadcast);
    });
    console.log('[PulseDB] Running in multi-instance mode (Redis Pub/Sub)');
  } else {
    // Single-instance mode: DB listener broadcasts directly to WS clients
    await createListenerClient((event) => {
      eventsProcessed.inc();
      broadcast(event);
      if (event.operation !== 'DELETE') sendOrderNotification(event.record);
      recordEventForAI(event, broadcast);
    });
    console.log('[PulseDB] Running in single-instance mode');
  }

  httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`[PulseDB] Server running on http://0.0.0.0:${config.port}`);
    console.log(`[PulseDB] WebSocket available at ws://0.0.0.0:${config.port}`);
    console.log(`[PulseDB] Health check: http://localhost:${config.port}/health`);
  });
}

main().catch((err) => {
  console.error('[PulseDB] Fatal startup error:', err);
  process.exit(1);
});

// Graceful shutdown: finish in-flight requests, close DB pool
async function shutdown(signal) {
  console.log(`[PulseDB] ${signal} received — shutting down gracefully...`);
  if (httpServer) {
    httpServer.close(async () => {
      await pool.end();
      console.log('[PulseDB] Shutdown complete');
      process.exit(0);
    });
  } else {
    await pool.end();
    console.log('[PulseDB] Shutdown complete');
    process.exit(0);
  }
  // Force exit after 10 seconds if still open
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections (common source of silent failures)
process.on('unhandledRejection', (reason) => {
  console.error('[PulseDB] Unhandled rejection:', reason);
});
