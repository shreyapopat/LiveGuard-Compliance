const express = require('express');
const { query } = require('../db');
const { FALLBACK_RULES } = require('../rulesEngine');

const router = express.Router();

// GET /api/rules — the active compliance rule catalogue (explainability)
router.get('/rules', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM compliance_rules WHERE is_active = true ORDER BY rule_id');
    res.json(rows);
  } catch (err) {
    // DB not reachable in this environment (e.g. local demo without Postgres) — fall back
    res.json(FALLBACK_RULES.map((r) => ({ ...r, id: r.rule_id })));
  }
});

// GET /api/calls — list recent calls for the supervisor dashboard
router.get('/calls', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.call_id, c.product_type, c.status, c.started_at, c.ended_at,
              c.duration_seconds, c.risk_score, c.risk_band, a.display_name AS agent_name
       FROM calls c JOIN agents a ON a.agent_id = c.agent_id
       ORDER BY c.started_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    res.status(503).json({ error: 'database_unavailable', detail: err.message });
  }
});

// GET /api/calls/:id — full detail incl. transcript, compliance events, summary
router.get('/calls/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [call, transcript, events, nudges, summary] = await Promise.all([
      query('SELECT * FROM calls WHERE call_id = $1', [id]),
      query('SELECT * FROM transcript_events WHERE call_id = $1 ORDER BY offset_ms', [id]),
      query('SELECT * FROM compliance_events WHERE call_id = $1 ORDER BY created_at', [id]),
      query('SELECT * FROM nudges WHERE call_id = $1 ORDER BY shown_at', [id]),
      query('SELECT * FROM call_summaries WHERE call_id = $1', [id]),
    ]);
    if (!call.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({
      call: call.rows[0],
      transcript: transcript.rows,
      compliance_events: events.rows,
      nudges: nudges.rows,
      summary: summary.rows[0] || null,
    });
  } catch (err) {
    res.status(503).json({ error: 'database_unavailable', detail: err.message });
  }
});

module.exports = router;
