# API Documentation

Base URL (local dev): `http://localhost:8080`

## REST API

### `GET /api/health`
Health check.

**Response 200**
```json
{ "ok": true, "db": true, "time": "2026-07-03T10:00:00.000Z" }
```
`db` is `false` if Postgres isn't reachable — the live-call demo still works (see
README), but call history is not persisted.

---

### `GET /api/rules`
Returns the active compliance rule catalogue (the explainable "what does the system
check for" list — useful for a compliance officer's review, or for driving the agent
checklist UI).

**Response 200**
```json
[
  {
    "rule_id": "LOAN_PROCESSING_FEE",
    "product_type": "loan",
    "description": "Agent must disclose the loan processing fee (amount or %) before the customer agrees to proceed.",
    "severity": "high",
    "detection_type": "deterministic",
    "match_patterns": { "any_of": ["processing fee", "processing charge", "one-time fee"] },
    "regulation_ref": "RBI Fair Practices Code, 2015 — para 2.2"
  }
]
```

---

### `POST /api/calls/start`
Creates a `calls` row and returns a `callId` to join over WebSocket. Also
auto-provisions a demo agent record if none exists, so the demo needs zero manual
seeding.

**Request body**
```json
{ "productType": "loan" }
```
`productType` — one of `loan` | `insurance` | `credit_card`. Defaults to `loan`.

**Response 200**
```json
{ "callId": "3f1a2e9e-...-uuid", "productType": "loan" }
```

If Postgres is unreachable, responds 200 with a client-side-usable UUID and a
`warning` field instead of failing the demo.

---

### `GET /api/calls`
Lists the 50 most recent calls (for a supervisor dashboard).

**Response 200**
```json
[
  {
    "call_id": "uuid",
    "product_type": "loan",
    "status": "completed",
    "started_at": "2026-07-03T09:58:00.000Z",
    "ended_at": "2026-07-03T10:03:12.000Z",
    "duration_seconds": 312,
    "risk_score": 18.0,
    "risk_band": "low",
    "agent_name": "Demo Agent"
  }
]
```

---

### `GET /api/calls/:id`
Full detail for one call: transcript, every compliance event (pass **and** fail —
auditability), nudges shown to the agent, and the generated summary.

**Response 200**
```json
{
  "call": { "call_id": "uuid", "status": "completed", "risk_score": 18.0, "...": "..." },
  "transcript": [
    { "speaker": "agent", "text": "This call is being recorded for quality purposes.", "offset_ms": 3200 }
  ],
  "compliance_events": [
    { "rule_id": "CALL_RECORDING_CONSENT", "status": "satisfied", "detection_type": "deterministic", "evidence_text": "call is being recorded", "confidence": 1.0 }
  ],
  "nudges": [
    { "nudge_type": "risk_phrase", "message": "Customer signalled affordability stress...", "severity": "warning" }
  ],
  "summary": {
    "summary_text": "Product type: loan. 3/4 mandatory disclosures were confirmed...",
    "risk_score": 18.0,
    "risk_band": "low",
    "recommended_action": "coach_agent"
  }
}
```

**404** if the call doesn't exist. **503** if the database is unreachable.

---

## WebSocket API — `ws://localhost:8080/ws`

One connection per browser tab. All messages are JSON. This single socket carries
WebRTC signaling, transcript ingestion, and server→client nudges (see
`docs/architecture.png` for the flow).

### Client → Server

| `type` | Payload | Purpose |
|---|---|---|
| `join` | `{ type, callId, role: 'agent'\|'customer', productType }` | Join/create a call room. Must be sent first. |
| `webrtc-offer` | `{ type, sdp }` | Relayed verbatim to the other peer in the room. |
| `webrtc-answer` | `{ type, sdp }` | Relayed verbatim to the other peer in the room. |
| `webrtc-ice` | `{ type, candidate }` | Relayed verbatim to the other peer in the room. |
| `transcript` | `{ type, speaker, text, isFinal }` | A finalized Web Speech API transcript chunk. Triggers rule evaluation. |
| `end-call` | `{ type }` | Ends the call: computes risk score, persists summary, broadcasts `call-ended`. |

### Server → Client

| `type` | Payload | Purpose |
|---|---|---|
| `joined` | `{ type, callId, role }` | Ack for `join`. |
| `webrtc-offer` / `webrtc-answer` / `webrtc-ice` | relayed from the other peer | WebRTC negotiation. |
| `checklist` | `{ type, checklist: [{rule_id, description, severity, status, evidence_text}] }` | Full checklist state, sent after every agent transcript chunk. Sent only to the agent tab. |
| `nudge` | `{ type, nudge_type, message, severity, confidence? }` | A single real-time nudge. `nudge_type` is `disclosure_missing` or `risk_phrase`. Sent only to the agent tab. |
| `call-ended` | `{ type, summary, risk_score, risk_band, recommended_action, checklist }` | Sent to the agent when the call ends, with the post-call artifact. |
| `peer-disconnected` | `{ type }` | The other party's tab disconnected. |

### Latency notes
Rule evaluation runs synchronously on the server per finalized transcript chunk and is
O(number of rules) substring checks — low single-digit milliseconds. The end-to-end
"agent says something → nudge appears" latency is dominated by the browser's own Web
Speech API finalization delay (typically 0.5–2s after the speaker pauses), not by this
server.
