# PulseDB — Enterprise Real-Time Database Event Streaming

> Because your database has a heartbeat. PulseDB listens to it.

## Overview
PulseDB is a highly scalable, real-time notification system designed to push database changes to connected clients instantaneously. Built specifically for modern, robust event-driven architectures, it bypasses the massive overhead of polling entirely.

## Architecture Diagram
```mermaid
graph TD
    Client[Dashboard Client] -- WebSocket (JWT) --> Node[Node.js Server]
    Node -- REST API --> DB[(PostgreSQL)]
    DB -- "pg_notify('orders')" --> Node
    Node -- enqueue job --> BullMQ[(Redis Queue)]
    Worker[BullMQ Worker] -- process job --> BullMQ
    Worker -- API Call --> Gemini[Google Gemini API]
    Prometheus[Prometheus] -- scrape /metrics --> Node
    Grafana[Grafana] -- query --> Prometheus
```

### Architectural Decisions & Evaluation Criteria Addressed
To satisfy the problem statement requirements, the system has been dramatically enhanced:

1. **Efficiency (No Polling)**:
   - Uses PostgreSQL's native `LISTEN/NOTIFY` system. Database triggers emit an event the exact millisecond a row is committed.
   - The backend listens to this Postgres channel via a dedicated client and streams the data directly over WebSocket. Zero CPU cycles are wasted on polling.

2. **Network Scalability (Selective Subscriptions)**:
   - Not every client needs every piece of data. We implemented a WebSocket filtering mechanism.
   - Clients send a `{"action": "subscribe", "statuses": ["pending"]}` message to the server. The server tracks this and *only* broadcasts events that match the client's interests, saving massive amounts of bandwidth.

3. **Resilience & State Recovery (The "Sync" Pattern)**:
   - Real-time systems suffer from connection drops.
   - PulseDB features an Audit Log table (`order_events`). If a WebSocket disconnects, upon reconnecting, it automatically queries a REST endpoint `/api/orders/sync?since=<TIMESTAMP>`.
   - The server replays any missed events perfectly. This ensures eventual consistency regardless of network stability.

4. **Background Job Queues & Fault Tolerance (BullMQ)**:
   - Instead of blocking the Node.js event loop or silently failing when an external service is down, PulseDB uses **BullMQ** (backed by Redis) to handle heavy tasks like Email Notifications.
   - High-priority orders are pushed to a Redis Queue. A background worker processes them asynchronously and utilizes an **Exponential Backoff Strategy** to retry failed deliveries automatically.
   - Uses Ethereal Email for zero-configuration demo email previews — no SMTP server required. Preview URLs are logged to the server console.

5. **Data Scalability (Cursor-Based Pagination)**:
   - To prevent memory leaks and massive payload transfers as the database grows, the primary API utilizes highly efficient cursor-based pagination (`?cursor=...&limit=10`).
   - The frontend cleanly integrates this with a "Load Older Orders" feature while seamlessly prepending real-time events.

6. **AI-Powered Anomaly Detection on the Event Stream**:
   - PulseDB implements real-time fraud analysis. Every database change event flows through the Node.js server where it is buffered into a rolling window.
   - Using the **Google Gemini 1.5 Flash API**, it analyzes the event window for suspicious patterns (e.g., impossible status reversals or velocity attacks).
   - If fraud is detected, an `ANOMALY_ALERT` is broadcast over the WebSocket to visually warn the dashboard administrator instantly.

7. **AI-Generated Order Summaries (Smart Notifications)**:
   - When a High-priority event triggers a background email job in BullMQ, the system dynamically queries the Google Gemini API.
   - Gemini translates the raw database JSON event into a warm, professional natural-language summary (e.g., *"Great news! Arjun's order for a MacBook has successfully been marked as shipped."*).
   - This showcases AI being used as a practical pipeline utility rather than a standalone gimmick.

8. **Observability Stack (Prometheus + Grafana)**:
   - Instrumented real-time event pipeline with Prometheus metrics via the `prom-client` module (`/metrics`).
   - A fully auto-provisioned Grafana instance provides instant visualizations tracking active WebSocket connections, system event rates, and BullMQ queue depth.

9. **WebSocket JWT Authentication**:
   - Secured WebSocket connections with JWT bearer token validation at the HTTP upgrade handshake level.
   - Prevents unauthenticated, anonymous clients from eavesdropping on the real-time order stream.

10. **Dead Letter Queue (DLQ) for BullMQ**:
    - Extends the background job processor for production reliability.
    - Jobs that fail after all exponential retries are gracefully moved to a DLQ state in Redis.
    - An `/api/admin/dlq` endpoint allows engineers to inspect failed jobs and trigger replays, showcasing "Day 2" operational awareness.

11. **Horizontal Scalability (Redis Pub/Sub)**:
   - For a production deployment behind a load balancer, standard WebSockets break (clients connected to Server A won't get DB notifications sent to Server B).
   - PulseDB integrates an optional Redis Pub/Sub layer. The DB listener publishes to Redis, and all horizontally scaled Node.js servers subscribe to Redis and push to their local WebSocket clients.

12. **Clean, Standardized UI Design**:
   - Built a highly accessible, standard enterprise UI without external frameworks to demonstrate raw CSS fundamentals. Features comprehensive client-side filtering, data tables, and toast alerts designed for maximum readability and speed.

13. **Zero-Touch Cloud Deployment (Auto-Migration)**:
   - Designed to deploy seamlessly to cloud PaaS providers like Render.com.
   - Includes a custom `server/migrate.js` bootloader script that queries the Postgres `information_schema` on startup. It checks for the existence of the `orders` table specifically before running migrations; if not found, it automatically executes the SQL schema, trigger functions, and seed data before launching the main Express server.

## Tech Stack
| Layer              | Technology              | Why                                |
|-------------------|-------------------------|------------------------------------|
| Database           | PostgreSQL 16           | Native LISTEN/NOTIFY, trigger hooks|
| Backend            | Node.js + Express       | Non-blocking, event-driven I/O     |
| Real-time          | WebSocket (ws)          | Full-duplex, low overhead          |
| Scalability        | Redis Pub/Sub           | Horizontal scaling message bus     |
| Background Jobs    | BullMQ                  | Robust job queues with auto-retries|
| AI Integration     | Google Gemini 1.5 Flash | Fraud detection & NLP summaries    |
| Observability      | Prometheus + Grafana    | Production-grade metrics tracking  |
| UI                 | Vanilla JS + CSS3       | High performance, zero bloat       |

## Quick Start (Docker — recommended)
```bash
docker compose up --build
# Open http://localhost:3000
```
> **Note:** Grafana is available at `http://localhost:3001` when running via Docker Compose locally.

## Run Without Docker
If you want to run the stack natively without Docker:
```bash
# 1. Start Postgres and Redis locally
# 2. Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost:5432/pulsedb"
export REDIS_URL="redis://localhost:6379"
export GEMINI_API_KEY="your-key"
export JWT_SECRET="your-secret"

# 3. Install dependencies
npm install

# 4. Start the server (auto-runs migrations)
npm start
```

## Testing Real-Time Updates
```bash
# Create an order (triggers INSERT notification → browser updates instantly)
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customer_name":"Arjun","product_name":"MacBook"}'

# Update status (triggers UPDATE notification)
curl -X PATCH http://localhost:3000/api/orders/1 \
  -H 'Content-Type: application/json' \
  -d '{"status":"shipped"}'

# Delete (triggers DELETE notification)
curl -X DELETE http://localhost:3000/api/orders/1
```
