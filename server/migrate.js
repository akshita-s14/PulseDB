const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  try {
    console.log('[Migration] Checking database status...');
    const res = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'orders'
      );
    `);
    
    if (!res.rows[0].exists) {
      console.log('[Migration] Tables not found. Initializing database...');
      const schema = fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8');
      const triggers = fs.readFileSync(path.join(__dirname, '../sql/triggers.sql'), 'utf8');
      const seed = fs.readFileSync(path.join(__dirname, '../sql/seed.sql'), 'utf8');
      
      await pool.query(schema);
      console.log('[Migration] Schema loaded.');
      await pool.query(triggers);
      console.log('[Migration] Triggers loaded.');
      await pool.query(seed);
      console.log('[Migration] Seed data loaded.');
      
      console.log('[Migration] Database initialized successfully.');
    } else {
      console.log('[Migration] Database already initialized. Skipping.');
    }
  } catch (error) {
    console.error('[Migration] Failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
