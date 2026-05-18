-- sql/schema.sql
-- Run this file once to set up the database structure

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  customer_name  VARCHAR(255)  NOT NULL,
  product_name   VARCHAR(255)  NOT NULL,
  priority       VARCHAR(50)   NOT NULL DEFAULT 'Normal',
  status         VARCHAR(50)   NOT NULL DEFAULT 'pending'
                 CONSTRAINT valid_status
                 CHECK (status IN ('pending', 'shipped', 'delivered')),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at DESC);

-- Audit log: persists every DB change event
CREATE TABLE IF NOT EXISTS order_events (
  id          SERIAL PRIMARY KEY,
  operation   VARCHAR(10)  NOT NULL,  -- INSERT | UPDATE | DELETE
  order_id    INTEGER,
  payload     JSONB        NOT NULL,
  occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_order_id   ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON order_events(occurred_at DESC);
