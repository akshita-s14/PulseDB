-- sql/seed.sql  (sample data for demo)
INSERT INTO orders (customer_name, product_name, priority, status) VALUES
  ('Arjun Sharma',  'MacBook Pro M3',   'High',   'pending'),
  ('Priya Mehta',   'iPhone 15 Pro',    'Normal', 'shipped'),
  ('Rohan Gupta',   'Sony WH-1000XM5',  'Low',    'delivered');
