-- sql/triggers.sql
-- The heart of PulseDB: fires on every INSERT, UPDATE, DELETE

CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
DECLARE
  payload     JSONB;
  record_data JSONB;
BEGIN
  -- For DELETE, NEW is null — use OLD. For INSERT/UPDATE, use NEW.
  record_data = CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;

  payload = jsonb_build_object(
    'operation',  TG_OP,
    'table',      TG_TABLE_NAME,
    'record',     record_data,
    'occurred_at', NOW()
  );

  -- 1. Push real-time event via pg_notify (max 8KB payload)
  PERFORM pg_notify('pulsedb_orders', payload::text);

  -- 2. Persist to audit log for event replay
  INSERT INTO order_events (operation, order_id, payload)
  VALUES (TG_OP, (record_data->>'id')::INTEGER, payload);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to orders table
DROP TRIGGER IF EXISTS orders_change_trigger ON orders;
CREATE TRIGGER orders_change_trigger
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_change();
