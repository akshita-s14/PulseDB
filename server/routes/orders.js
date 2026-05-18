const express = require('express');
const { pool } = require('../db');
const router  = express.Router();

router.get('/', async (req, res) => {
  try {
    const { cursor, limit = 10 } = req.query;
    
    let query = 'SELECT * FROM orders ORDER BY id DESC LIMIT $1';
    let params = [parseInt(limit, 10)];

    if (cursor) {
      query = 'SELECT * FROM orders WHERE id < $2 ORDER BY id DESC LIMIT $1';
      params.push(parseInt(cursor, 10));
    }

    const { rows } = await pool.query(query, params);
    
    // Determine the next cursor (the ID of the very last row returned)
    const nextCursor = rows.length === parseInt(limit, 10) ? rows[rows.length - 1].id : null;
    
    res.json({ data: rows, nextCursor });
  } catch (err) {
    console.error('[API] GET /orders error:', err.message);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Resilience: Sync endpoint for clients to catch up on missed events after reconnecting
router.get('/sync', async (req, res) => {
  const { since } = req.query;
  if (!since) return res.status(400).json({ error: 'since timestamp required' });

  try {
    const { rows } = await pool.query(
      'SELECT payload FROM order_events WHERE occurred_at > $1 ORDER BY occurred_at ASC',
      [since]
    );
    // Return just the payloads as if they were live events
    res.json(rows.map(r => r.payload));
  } catch (err) {
    console.error('[API] GET /sync error:', err.message);
    res.status(500).json({ error: 'Failed to sync events' });
  }
});

router.post('/', async (req, res) => {
  const { customer_name, product_name, priority = 'Normal', status = 'pending' } = req.body;

  if (!customer_name || !product_name) {
    return res.status(400).json({ error: 'customer_name and product_name are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO orders (customer_name, product_name, priority, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [customer_name, product_name, priority, status]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[API] POST /orders error:', err.message);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ['pending', 'shipped', 'delivered'];

  if (!status || !valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[API] PATCH /orders error:', err.message);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM orders WHERE id = $1 RETURNING *', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ deleted: true, order: rows[0] });
  } catch (err) {
    console.error('[API] DELETE /orders error:', err.message);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

module.exports = router;
