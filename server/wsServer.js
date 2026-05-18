const { WebSocketServer, WebSocket } = require('ws');
const { activeWsConnections } = require('./metrics');
const jwt = require('jsonwebtoken');
const url = require('url');

function createWsServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const { query } = url.parse(request.url, true);
    const token = query.token;

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET || 'pulsedb_secret');
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    activeWsConnections.inc();
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected: ${ip} | Total: ${wss.clients.size}`);

    // Default subscription: receive all events
    ws.subscriptions = ['all'];

    ws.send(JSON.stringify({
      type:      'CONNECTED',
      message:   'PulseDB: connected',
      server_at: new Date().toISOString(),
    }));

    // Listen for client subscription changes (Network Efficiency Feature)
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.action === 'subscribe') {
          ws.subscriptions = data.statuses || ['all'];
          console.log(`[WS] Client updated subscriptions to: ${ws.subscriptions}`);
          ws.send(JSON.stringify({ type: 'INFO', message: `Subscribed to: ${ws.subscriptions.join(', ')}` }));
        }
      } catch (err) {
        console.error('[WS] Failed to parse client message');
      }
    });

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
      activeWsConnections.dec();
      console.log(`[WS] Client disconnected | Remaining: ${wss.clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });
  });

  // Heartbeat to clear dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  function broadcast(data) {
    const payload = JSON.stringify({ type: 'ORDER_EVENT', ...data });
    let sent = 0;
    
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        // Network Efficiency: Only send if client is subscribed to this status
        const recordStatus = data.record ? data.record.status : null;
        if (ws.subscriptions.includes('all') || (recordStatus && ws.subscriptions.includes(recordStatus)) || data.operation === 'DELETE') {
          ws.send(payload);
          sent++;
        }
      }
    });
    console.log(`[WS] Broadcasted ${data.operation} to ${sent}/${wss.clients.size} client(s)`);
  }

  return { wss, broadcast };
}

module.exports = { createWsServer };
