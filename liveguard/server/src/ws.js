// =====================================================================
// Call-session WebSocket server.
//
// One WS connection per browser tab (agent or customer). A "call" is a
// room keyed by callId that holds exactly one agent + one customer.
// This socket carries THREE kinds of message over one channel, which
// keeps the demo simple (no separate signaling vs. data-channel infra):
//
//   1. WebRTC signaling: {type:'webrtc-offer'|'webrtc-answer'|'webrtc-ice', ...}
//      relayed verbatim to the other peer in the room — this is what
//      makes the audio call itself real WebRTC, not a simulation.
//   2. Transcript chunks: {type:'transcript', speaker, text, isFinal}
//      produced client-side by the Web Speech API (see web/app.js).
//   3. Server -> agent nudges: {type:'nudge', ...} and
//      {type:'checklist', ...} pushed after every finalized transcript
//      chunk is run through the rule engine + soft-signal detector.
//
// Latency budget: rule evaluation is a handful of substring checks over
// a short cumulative string (O(rules) per final chunk) so it runs in
// low single-digit ms — the dominant latency in the pipeline is the
// browser's own STT finalization delay, not this server.
// =====================================================================

const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./db');
const { evaluateChecklist, checkOverdueDisclosures } = require('./rulesEngine');
const { classifyWithLLM, NUDGE_COPY } = require('./llmSignals');
const { computeRiskScore, buildSummaryText, recommendedAction } = require('./summary');

// In-memory session state (per running process — fine for a hackathon
// demo; a production version would move this to Redis to allow
// horizontal scaling of the WS layer, noted in ASSUMPTIONS.md).
const rooms = new Map(); // callId -> { agentWs, customerWs, productType, agentText, startedAt, softSignalHits, violationsCount, timer }

function getOrCreateRoom(callId, productType) {
  if (!rooms.has(callId)) {
    rooms.set(callId, {
      agentWs: null,
      customerWs: null,
      productType: productType || 'loan',
      agentText: '',
      startedAt: Date.now(),
      softSignalHits: [],
      violationsCount: 0,
      lastChecklist: [],
    });
  }
  return rooms.get(callId);
}

function safeSend(ws, payload) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

async function persistTranscript(callId, speaker, text, offsetMs) {
  try {
    await query(
      'INSERT INTO transcript_events (call_id, speaker, text, is_final, offset_ms) VALUES ($1,$2,$3,true,$4)',
      [callId, speaker, text, offsetMs]
    );
  } catch (err) {
    console.warn('[ws] transcript persist failed (continuing in-memory only):', err.message);
  }
}

async function persistComplianceEvent(callId, ruleId, status, detectionType, evidence, confidence, offsetMs) {
  try {
    await query(
      `INSERT INTO compliance_events
         (call_id, rule_id, status, detection_type, evidence_text, confidence, triggered_offset_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [callId, ruleId, status, detectionType, evidence, confidence, offsetMs]
    );
  } catch (err) {
    console.warn('[ws] compliance event persist failed:', err.message);
  }
}

async function persistNudge(callId, nudgeType, message, severity) {
  try {
    await query(
      'INSERT INTO nudges (call_id, nudge_type, message, severity) VALUES ($1,$2,$3,$4)',
      [callId, nudgeType, message, severity]
    );
  } catch (err) {
    console.warn('[ws] nudge persist failed:', err.message);
  }
}

async function handleAgentTranscript(room, callId, text, offsetMs, ws) {
  room.agentText += ' ' + text;
  const checklist = evaluateChecklist(room.agentText, room.productType);
  room.lastChecklist = checklist;

  // push checklist state to the agent sidebar
  safeSend(room.agentWs, { type: 'checklist', checklist });

  // persist newly-satisfied items as compliance_events (idempotent-ish: only log transitions)
  for (const item of checklist) {
    if (item.status === 'satisfied') {
      await persistComplianceEvent(callId, item.rule_id, 'satisfied', 'deterministic', item.evidence_text, 1.0, offsetMs);
    }
  }

  const elapsedSeconds = Math.round((Date.now() - room.startedAt) / 1000);
  const overdue = checkOverdueDisclosures(checklist, elapsedSeconds);
  for (const nudge of overdue) {
    safeSend(room.agentWs, { type: 'nudge', nudge_type: 'disclosure_missing', ...nudge });
    await persistNudge(callId, 'disclosure_missing', nudge.message, nudge.severity);
  }
}

async function handleCustomerTranscript(room, callId, text, offsetMs) {
  const signal = await classifyWithLLM(text);
  if (signal) {
    room.softSignalHits.push(signal);
    const message = NUDGE_COPY[signal.label] || `Risk signal detected: ${signal.label}`;
    safeSend(room.agentWs, {
      type: 'nudge',
      nudge_type: 'risk_phrase',
      message,
      severity: signal.label === 'possible_mis_selling_claim' ? 'critical' : 'warning',
      confidence: signal.confidence,
    });
    await persistComplianceEvent(callId, 'MIS_SELLING_RISK_PHRASE', 'flagged', 'llm_assisted', text, signal.confidence, offsetMs);
    await persistNudge(callId, 'risk_phrase', message, signal.label === 'possible_mis_selling_claim' ? 'critical' : 'warning');
  }
}

async function endCall(room, callId) {
  const checklist = room.lastChecklist.length
    ? room.lastChecklist
    : evaluateChecklist(room.agentText, room.productType);
  const { score, band } = computeRiskScore({
    checklist,
    violationsCount: room.violationsCount,
    softSignalHits: room.softSignalHits,
  });
  const summaryText = buildSummaryText({ checklist, softSignalHits: room.softSignalHits, riskBand: band, productType: room.productType });
  const action = recommendedAction(band, checklist.filter((c) => c.status !== 'satisfied').length);
  const durationSeconds = Math.round((Date.now() - room.startedAt) / 1000);

  try {
    await query(
      `UPDATE calls SET status='completed', ended_at=now(), duration_seconds=$2, risk_score=$3, risk_band=$4 WHERE call_id=$1`,
      [callId, durationSeconds, score, band]
    );
    await query(
      `INSERT INTO call_summaries (call_id, summary_text, disclosures_met, disclosures_required, violations_count, risk_score, risk_band, recommended_action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (call_id) DO UPDATE SET summary_text=EXCLUDED.summary_text, risk_score=EXCLUDED.risk_score, risk_band=EXCLUDED.risk_band`,
      [
        callId,
        summaryText,
        checklist.filter((c) => c.status === 'satisfied').length,
        checklist.length,
        room.violationsCount,
        score,
        band,
        action,
      ]
    );
  } catch (err) {
    console.warn('[ws] end-of-call persist failed:', err.message);
  }

  const payload = { type: 'call-ended', summary: summaryText, risk_score: score, risk_band: band, recommended_action: action, checklist };
  safeSend(room.agentWs, payload);
  safeSend(room.customerWs, { type: 'call-ended' });
  rooms.delete(callId);
}

function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    let joinedCallId = null;
    let role = null;

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'join') {
        joinedCallId = msg.callId || uuidv4();
        role = msg.role === 'customer' ? 'customer' : 'agent';
        const room = getOrCreateRoom(joinedCallId, msg.productType);
        if (role === 'agent') room.agentWs = ws;
        else room.customerWs = ws;
        safeSend(ws, { type: 'joined', callId: joinedCallId, role });
        // let the agent know current checklist immediately (empty state)
        if (role === 'agent') {
          safeSend(ws, { type: 'checklist', checklist: evaluateChecklist('', room.productType) });
        }
        return;
      }

      if (!joinedCallId) return; // must join first
      const room = rooms.get(joinedCallId);
      if (!room) return;

      switch (msg.type) {
        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice': {
          const other = role === 'agent' ? room.customerWs : room.agentWs;
          safeSend(other, msg);
          break;
        }
        case 'transcript': {
          const offsetMs = Date.now() - room.startedAt;
          await persistTranscript(joinedCallId, role, msg.text, offsetMs);
          if (role === 'agent') {
            await handleAgentTranscript(room, joinedCallId, msg.text, offsetMs, ws);
          } else {
            await handleCustomerTranscript(room, joinedCallId, msg.text, offsetMs);
          }
          break;
        }
        case 'end-call': {
          await endCall(room, joinedCallId);
          break;
        }
        default:
          break;
      }
    });

    ws.on('close', () => {
      if (!joinedCallId) return;
      const room = rooms.get(joinedCallId);
      if (!room) return;
      if (role === 'agent') room.agentWs = null;
      else room.customerWs = null;
      // notify the remaining peer
      safeSend(role === 'agent' ? room.customerWs : room.agentWs, { type: 'peer-disconnected' });
    });
  });

  return wss;
}

module.exports = { attachWebSocketServer };
