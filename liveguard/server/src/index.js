require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');

const callsRouter = require('./routes/calls');
const { attachWebSocketServer } = require('./ws');
const { query } = require('./db');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    await query('SELECT 1');
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({ ok: true, db: dbOk, time: new Date().toISOString() });
});

app.use('/api', callsRouter);

// POST /api/calls/start — create a call row and hand back a callId the
// browser will use to join the WS room. Auto-creates a demo agent/customer
// row if none exist, so the demo works with zero manual seeding.
app.post('/api/calls/start', async (req, res) => {
  const { productType = 'loan' } = req.body || {};
  try {
    let agent = await query('SELECT agent_id FROM agents LIMIT 1');
    if (!agent.rows.length) {
      agent = await query(
        `INSERT INTO agents (display_name, employee_code) VALUES ('Demo Agent','EMP-001') RETURNING agent_id`
      );
    }
    const agentId = agent.rows[0].agent_id;
    const call = await query(
      `INSERT INTO calls (agent_id, product_type) VALUES ($1,$2) RETURNING call_id`,
      [agentId, productType]
    );
    res.json({ callId: call.rows[0].call_id, productType });
  } catch (err) {
    // DB unavailable — still let the demo run with a client-generated id
    // (WS layer works fully in-memory; persistence just no-ops).
    res.json({ callId: require('crypto').randomUUID(), productType, warning: 'db_unavailable: ' + err.message });
  }
});

// Serve the static frontend if present (optional convenience for the demo)
app.use(express.static(path.join(__dirname, '../../web')));

const port = process.env.PORT || 8080;
const server = http.createServer(app);
attachWebSocketServer(server);

server.listen(port, () => {
  console.log(`LiveGuard server listening on :${port}`);
  console.log(`  REST:      http://localhost:${port}/api/health`);
  console.log(`  WebSocket: ws://localhost:${port}/ws`);
  console.log(`  Frontend:  http://localhost:${port}/index.html?role=agent`);
});
