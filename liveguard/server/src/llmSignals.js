// =====================================================================
// Soft-signal detection: sentiment / distress / mis-selling risk phrases
// in CUSTOMER speech. This is the one place an LLM is used in the
// pipeline — deliberately scoped narrow (see rulesEngine.js for why the
// disclosure checklist itself stays deterministic).
//
// Calls the Anthropic Messages API when ANTHROPIC_API_KEY is set.
// Falls back to a local keyword heuristic when it isn't, so the demo
// still runs fully offline — this fallback is intentional, not a bug,
// and is disclosed in AI_TOOLS_USED.md.
// =====================================================================

const FALLBACK_PHRASES = [
  { pattern: /can'?t afford|too expensive|don'?t have (the )?money/i, label: 'affordability_stress' },
  { pattern: /guaranteed return|guaranteed profit|no risk at all/i, label: 'possible_mis_selling_claim' },
  { pattern: /i don'?t (really )?understand|confus(ed|ing)|not sure what (this|that) means/i, label: 'customer_confusion' },
  { pattern: /cancel (the|this) (policy|loan|card)|want to cancel|change my mind/i, label: 'cancellation_intent' },
  { pattern: /pressur(e|ing)|forcing me|keep calling me/i, label: 'pressure_complaint' },
];

async function classifyOffline(customerUtterance) {
  const hit = FALLBACK_PHRASES.find((p) => p.pattern.test(customerUtterance));
  if (!hit) return null;
  return {
    label: hit.label,
    confidence: 0.72, // static confidence for the heuristic fallback — flagged as such downstream
    method: 'heuristic_fallback',
  };
}

async function classifyWithLLM(customerUtterance) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return classifyOffline(customerUtterance);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system:
          'You are a BFSI call-centre risk classifier. Given one customer utterance, ' +
          'decide if it signals: affordability_stress, possible_mis_selling_claim, ' +
          'customer_confusion, cancellation_intent, pressure_complaint, or none. ' +
          'Respond ONLY with JSON: {"label": "<one_of_above_or_none>", "confidence": <0-1>}. No prose.',
        messages: [{ role: 'user', content: customerUtterance }],
      }),
    });
    const data = await resp.json();
    const text = (data.content || []).map((b) => b.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!parsed.label || parsed.label === 'none') return null;
    return { label: parsed.label, confidence: parsed.confidence ?? 0.6, method: 'llm' };
  } catch (err) {
    console.warn('[llmSignals] LLM call failed, falling back to heuristic:', err.message);
    return classifyOffline(customerUtterance);
  }
}

const NUDGE_COPY = {
  affordability_stress: 'Customer signalled affordability stress — pause the pitch, consider a retention/eligibility review.',
  possible_mis_selling_claim: 'A "guaranteed return" style claim was made — verify wording matches the approved script.',
  customer_confusion: 'Customer sounds confused — consider re-explaining key terms before proceeding.',
  cancellation_intent: 'Customer signalled intent to cancel — route to retention if appropriate.',
  pressure_complaint: 'Customer described feeling pressured — de-escalate and confirm consent to continue.',
};

module.exports = { classifyWithLLM, NUDGE_COPY };
