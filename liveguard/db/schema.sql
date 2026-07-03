-- =====================================================================
-- LiveGuard — Database Schema (PostgreSQL 14+)
-- =====================================================================
-- Design notes:
--  * Every table that matters for compliance keeps an append-only trail
--    (calls, transcript_events, compliance_events) rather than mutable
--    "current state" fields — auditability is a BFSI hard requirement,
--    not a nice-to-have.
--  * The rule catalogue is data, not code, so new disclosure rules can
--    be added by a compliance officer without a deploy.
-- =====================================================================

CREATE TABLE IF NOT EXISTS agents (
    agent_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name    TEXT NOT NULL,
    employee_code    TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name    TEXT NOT NULL,
    phone_number    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The catalogue of mandatory disclosure / conduct rules. Deterministic,
-- explainable, versioned — this is the "no black box" answer to a
-- BFSI auditor asking "how did the system decide that was a violation?"
CREATE TABLE IF NOT EXISTS compliance_rules (
    rule_id         TEXT PRIMARY KEY,          -- e.g. 'LOAN_PROCESSING_FEE'
    product_type    TEXT NOT NULL,             -- 'loan' | 'insurance' | 'credit_card'
    description     TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    detection_type  TEXT NOT NULL CHECK (detection_type IN ('deterministic','llm_assisted')),
    match_patterns  JSONB,                     -- keyword/regex patterns used by the deterministic engine
    regulation_ref  TEXT,                      -- e.g. 'RBI Fair Practices Code 2015, para 2.2'
    is_active       BOOLEAN NOT NULL DEFAULT true,
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
    call_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agents(agent_id),
    customer_id     UUID REFERENCES customers(customer_id),
    product_type    TEXT NOT NULL,             -- drives which rules apply
    status          TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress','completed','dropped')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    duration_seconds INT,
    risk_score      NUMERIC(4,1),              -- 0-100, computed post-call
    risk_band       TEXT CHECK (risk_band IN ('low','medium','high')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw streaming transcript, append-only. This is the evidentiary record.
CREATE TABLE IF NOT EXISTS transcript_events (
    event_id        BIGSERIAL PRIMARY KEY,
    call_id         UUID NOT NULL REFERENCES calls(call_id) ON DELETE CASCADE,
    speaker         TEXT NOT NULL CHECK (speaker IN ('agent','customer')),
    text            TEXT NOT NULL,
    is_final        BOOLEAN NOT NULL DEFAULT true,
    offset_ms       INT NOT NULL,               -- ms since call start
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every compliance check result — passes AND fails — for full auditability.
-- A supervisor should be able to reconstruct exactly why a nudge fired.
CREATE TABLE IF NOT EXISTS compliance_events (
    compliance_event_id BIGSERIAL PRIMARY KEY,
    call_id             UUID NOT NULL REFERENCES calls(call_id) ON DELETE CASCADE,
    rule_id             TEXT NOT NULL REFERENCES compliance_rules(rule_id),
    status              TEXT NOT NULL CHECK (status IN ('satisfied','pending','violated','flagged')),
    detection_type      TEXT NOT NULL CHECK (detection_type IN ('deterministic','llm_assisted')),
    evidence_text       TEXT,                   -- transcript snippet that triggered the event
    confidence          NUMERIC(3,2),            -- 0-1, mainly for llm_assisted events
    triggered_offset_ms INT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The nudge actually shown to the agent (a subset of compliance_events
-- becomes a nudge; not every logged event needs to interrupt the agent).
CREATE TABLE IF NOT EXISTS nudges (
    nudge_id        BIGSERIAL PRIMARY KEY,
    call_id         UUID NOT NULL REFERENCES calls(call_id) ON DELETE CASCADE,
    compliance_event_id BIGINT REFERENCES compliance_events(compliance_event_id),
    nudge_type      TEXT NOT NULL CHECK (nudge_type IN ('disclosure_missing','risk_phrase','mis_selling_risk','positive_ack')),
    message         TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
    acknowledged    BOOLEAN NOT NULL DEFAULT false,
    shown_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ
);

-- One row per call — the post-call artifact for supervisor review.
CREATE TABLE IF NOT EXISTS call_summaries (
    call_id             UUID PRIMARY KEY REFERENCES calls(call_id) ON DELETE CASCADE,
    summary_text        TEXT NOT NULL,
    disclosures_met     INT NOT NULL,
    disclosures_required INT NOT NULL,
    violations_count    INT NOT NULL DEFAULT 0,
    risk_score          NUMERIC(4,1) NOT NULL,
    risk_band           TEXT NOT NULL CHECK (risk_band IN ('low','medium','high')),
    recommended_action  TEXT,                   -- e.g. 'none' | 'coach_agent' | 'escalate_to_compliance'
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcript_call ON transcript_events(call_id, offset_ms);
CREATE INDEX IF NOT EXISTS idx_compliance_call ON compliance_events(call_id);
CREATE INDEX IF NOT EXISTS idx_nudges_call ON nudges(call_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_id);

-- =====================================================================
-- Seed data: 5 realistic disclosure/conduct rules (scoped down per
-- ASSUMPTIONS.md — not a full regulatory library)
-- =====================================================================
INSERT INTO compliance_rules (rule_id, product_type, description, severity, detection_type, match_patterns, regulation_ref) VALUES
('LOAN_PROCESSING_FEE', 'loan',
  'Agent must disclose the loan processing fee (amount or %) before the customer agrees to proceed.',
  'high', 'deterministic',
  '{"any_of": ["processing fee", "processing charge", "one-time fee"]}',
  'RBI Fair Practices Code, 2015 — para 2.2 (all charges to be disclosed upfront)'),

('LOAN_INTEREST_RATE', 'loan',
  'Agent must state the applicable annual interest rate / APR.',
  'critical', 'deterministic',
  '{"any_of": ["interest rate", "annual percentage rate", "apr of", "% per annum", "rate of interest"]}',
  'RBI Fair Practices Code, 2015 — Key Facts Statement requirement'),

('INSURANCE_FREE_LOOK', 'insurance',
  'Agent must disclose the free-look / cooling-off period during which the policy can be cancelled for a full refund.',
  'critical', 'deterministic',
  '{"any_of": ["free-look period", "free look period", "cooling off period", "cooling-off period"]}',
  'IRDAI (Protection of Policyholders'' Interests) Regulations — free-look clause'),

('CALL_RECORDING_CONSENT', 'all',
  'Agent must inform the customer that the call is being recorded for quality/compliance purposes.',
  'medium', 'deterministic',
  '{"any_of": ["call is being recorded", "call may be recorded", "recorded for quality", "recorded for training"]}',
  'Standard BFSI call-centre conduct requirement'),

('MIS_SELLING_RISK_PHRASE', 'all',
  'Customer used language suggesting affordability stress, confusion, or a guaranteed-return claim was made — flag for retention/compliance review.',
  'high', 'llm_assisted',
  '{"soft_signal": true}',
  'Internal conduct-risk policy (mis-selling prevention)')
ON CONFLICT (rule_id) DO NOTHING;
