// =====================================================================
// Deterministic rule engine.
//
// Deliberately NOT an LLM call: BFSI compliance requires an explainable,
// auditable "why did this fire" answer, and a keyword/regex match on the
// agent's own words gives a supervisor exactly that. The LLM is reserved
// for soft signals (llmSignals.js) where a rule genuinely can't be
// reduced to a pattern match — e.g. detecting customer distress.
// =====================================================================

// Mirrors the seed rows in db/schema.sql. Loaded from DB in a real
// deployment (see loadRulesFromDb); hardcoded here as a fallback so the
// engine still works if the DB is unreachable during a demo.
const FALLBACK_RULES = [
  {
    rule_id: 'LOAN_PROCESSING_FEE',
    product_type: 'loan',
    description: 'Disclose the loan processing fee before the customer agrees.',
    severity: 'high',
    patterns: ['processing fee', 'processing charge', 'one-time fee'],
  },
  {
    rule_id: 'LOAN_INTEREST_RATE',
    product_type: 'loan',
    description: 'State the applicable annual interest rate / APR.',
    severity: 'critical',
    patterns: ['interest rate', 'annual percentage rate', 'apr of', 'per annum', 'rate of interest'],
  },
  {
    rule_id: 'INSURANCE_FREE_LOOK',
    product_type: 'insurance',
    description: 'Disclose the free-look / cooling-off period.',
    severity: 'critical',
    patterns: ['free-look period', 'free look period', 'cooling off period', 'cooling-off period'],
  },
  {
    rule_id: 'CALL_RECORDING_CONSENT',
    product_type: 'all',
    description: 'Inform the customer the call is being recorded.',
    severity: 'medium',
    patterns: ['call is being recorded', 'call may be recorded', 'recorded for quality', 'recorded for training'],
  },
];

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function rulesForProduct(productType) {
  return FALLBACK_RULES.filter((r) => r.product_type === 'all' || r.product_type === productType);
}

/**
 * Evaluate the agent's cumulative transcript against every applicable
 * deterministic rule and return the checklist state.
 *
 * @param {string} cumulativeAgentText - all agent speech so far, concatenated
 * @param {string} productType - 'loan' | 'insurance' | 'credit_card'
 * @returns {Array<{rule_id, description, severity, status, evidence_text|null}>}
 */
function evaluateChecklist(cumulativeAgentText, productType) {
  const haystack = normalize(cumulativeAgentText);
  return rulesForProduct(productType).map((rule) => {
    const hit = rule.patterns.find((p) => haystack.includes(p));
    return {
      rule_id: rule.rule_id,
      description: rule.description,
      severity: rule.severity,
      status: hit ? 'satisfied' : 'pending',
      evidence_text: hit || null,
    };
  });
}

/**
 * Called incrementally per finalized transcript chunk. Returns a nudge
 * only when a rule transitions into "should have been said by now but
 * wasn't" — the time-pressure heuristic below is intentionally simple
 * (elapsed seconds since call start) rather than a trained model, again
 * for explainability. Tune SLA_SECONDS per rule as real call data comes in.
 */
const SLA_SECONDS = {
  CALL_RECORDING_CONSENT: 15,   // should be said almost immediately
  LOAN_INTEREST_RATE: 90,
  LOAN_PROCESSING_FEE: 120,
  INSURANCE_FREE_LOOK: 150,
};

function checkOverdueDisclosures(checklist, elapsedSeconds) {
  return checklist
    .filter((item) => item.status === 'pending')
    .filter((item) => elapsedSeconds >= (SLA_SECONDS[item.rule_id] ?? 999999))
    .map((item) => ({
      rule_id: item.rule_id,
      message: `Missing disclosure: "${item.description}"`,
      severity: item.severity === 'critical' ? 'critical' : 'warning',
    }));
}

module.exports = { evaluateChecklist, checkOverdueDisclosures, rulesForProduct, FALLBACK_RULES };
