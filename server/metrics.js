const client = require('prom-client');

// Auto-collect default OS/Node.js metrics (CPU, Memory, etc)
client.collectDefaultMetrics({ prefix: 'pulsedb_' });

// Custom Business Metrics
const activeWsConnections = new client.Gauge({
  name: 'pulsedb_active_ws_connections',
  help: 'Current number of active WebSocket connections',
});

const eventsProcessed = new client.Counter({
  name: 'pulsedb_events_processed_total',
  help: 'Total number of database events processed and broadcasted',
});

const emailJobsAdded = new client.Counter({
  name: 'pulsedb_email_jobs_total',
  help: 'Total number of email notification jobs queued',
});

// Initialize metrics to 0 so Grafana displays them immediately on boot
activeWsConnections.set(0);
eventsProcessed.inc(0);
emailJobsAdded.inc(0);

module.exports = {
  registry: client.register,
  activeWsConnections,
  eventsProcessed,
  emailJobsAdded
};
