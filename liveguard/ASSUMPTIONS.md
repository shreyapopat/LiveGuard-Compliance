# Assumptions & Limitations

This document is deliberately explicit about what's scoped out. In a compliance-adjacent
product, an honest limitations list is more trustworthy than a demo that quietly papers
over gaps — and it's also what let this get built to a working state in the available
time instead of stalling on breadth.

## Explicitly out of scope (and why)

### 1. Real PBX / telephony integration
The call is simulated as a browser-to-browser WebRTC connection (two tabs), not a real
inbound/outbound call through a telephony provider (Twilio, Exotel, Ozonetel, etc.).
**Why this is a reasonable simplification:** the hard, novel part of this system is the
real-time analysis pipeline (streaming STT → rule engine → nudge), not the SIP trunking.
Swapping the audio source from "two WebRTC peers" to "a telephony provider's media
stream" is an integration task against `ws.js`'s transcript-ingestion contract, not a
redesign — the rule engine and nudge pipeline are provider-agnostic by construction.

### 2. Multi-language support
Only English (`en-US`) is wired up, via the Web Speech API's `lang` setting and the
rule engine's English keyword patterns. Real BFSI call centers in India, for example,
need Hindi and regional languages. Noted as the top priority for a v2.

### 3. Full regulatory rule library
5 rules are implemented instead of a comprehensive library covering every RBI/IRDAI/
SEBI disclosure requirement across products:

1. Loan processing fee disclosure
2. Loan interest rate / APR disclosure
3. Insurance free-look (cooling-off) period disclosure
4. Call recording consent
5. Mis-selling / distress risk phrases (LLM-assisted)

**Why 5 and not more:** the rules are stored as data (`compliance_rules` table) with a
`match_patterns` JSON column, so adding rule #6 is a data-entry task, not a code change.
Demonstrating the pattern with 5 realistic rules across two product types (loan,
insurance) proves the mechanism works; scaling the catalogue is operational work for a
compliance team, not an engineering risk.

## Other assumptions worth stating

- **Deterministic rules vs. LLM use is a deliberate split, not a resourcing shortcut.**
  Mandatory disclosures are checked by keyword/phrase matching specifically so a
  supervisor or auditor can see exactly why a rule fired — "the agent's transcript
  contains the string 'processing fee'" is a fact a compliance officer can verify in
  seconds. An LLM verdict on a legally-required disclosure would itself be a compliance
  risk ("the black box decided this rule was satisfied"). The LLM is scoped to the one
  place a keyword match genuinely can't do the job: detecting customer sentiment/
  distress, where nuance actually matters and the output is advisory (a nudge), not a
  determination that get recorded as compliance fact.
- **The LLM path has an offline fallback.** If no API key is configured,
  `llmSignals.js` falls back to a local keyword heuristic so the whole system — including
  the "soft signal" nudges — still runs end-to-end without network access. This is
  disclosed, not hidden: fallback-classified nudges are tagged `method: heuristic_fallback`
  in the code and would be labeled as lower-confidence in a production UI.
- **Risk scoring is a transparent weighted formula, not a trained model** (see
  `server/src/summary.js`). Given no historical labeled call data exists yet, a
  hand-tuned, explainable formula (missed disclosures weighted heaviest, then
  violations, then soft-signal hits) is more defensible than a model trained on
  synthetic data pretending to be calibrated.
- **In-memory session state.** Live call state (`rooms` map in `ws.js`) lives in the
  Node process's memory, not Redis. Fine for a single-instance demo; horizontal scaling
  of the WebSocket layer would need shared state — noted as a scaling follow-up, not
  solved here.
- **No authentication/authorization layer.** Agent/customer identity is not verified;
  there's no login. A real deployment needs this obviously, but it's orthogonal to what
  this prototype is trying to prove.
- **The compliance/severity thresholds (e.g. "recording consent should be said within 15
  seconds") are illustrative starting points**, not values derived from real call data
  or legal review — they'd need tuning against actual call logs before use, and that
  tuning process (avoiding false-positive nudge fatigue vs. missing real violations) is
  itself flagged in the pitch as the hardest remaining engineering problem.

## What was assumed present in the environment

- A PostgreSQL 14+ instance reachable via `DATABASE_URL`.
- Node.js 18+.
- A Chromium-based browser (Chrome/Edge) for the Web Speech API on the client side —
  Firefox and Safari do not implement it, so the demo will show a message and continue
  in transcript-degraded mode there.
