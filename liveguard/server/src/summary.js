// Post-call artifact generation: risk score + human-readable summary.
// Scoring is a simple, explainable weighted formula on purpose — see
// ASSUMPTIONS.md for why we didn't train a model for this.

function computeRiskScore({ checklist, violationsCount, softSignalHits }) {
  const total = checklist.length || 1;
  const satisfied = checklist.filter((c) => c.status === 'satisfied').length;
  const missing = total - satisfied;

  const missingPenalty = (missing / total) * 60;      // up to 60 pts for missed disclosures
  const violationPenalty = Math.min(violationsCount * 10, 25); // up to 25 pts
  const softSignalPenalty = Math.min(softSignalHits.length * 5, 15); // up to 15 pts

  const score = Math.min(100, Math.round((missingPenalty + violationPenalty + softSignalPenalty) * 10) / 10);
  const band = score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, band };
}

function buildSummaryText({ checklist, softSignalHits, riskBand, productType }) {
  const satisfied = checklist.filter((c) => c.status === 'satisfied');
  const missing = checklist.filter((c) => c.status !== 'satisfied');

  const lines = [];
  lines.push(`Product type: ${productType}.`);
  lines.push(
    `${satisfied.length}/${checklist.length} mandatory disclosures were confirmed during the call` +
      (satisfied.length ? ` (${satisfied.map((s) => s.rule_id).join(', ')}).` : '.')
  );
  if (missing.length) {
    lines.push(`Missing: ${missing.map((m) => m.rule_id).join(', ')} — flagged for supervisor review.`);
  }
  if (softSignalHits.length) {
    lines.push(
      `${softSignalHits.length} customer risk signal(s) detected: ${softSignalHits.map((s) => s.label).join(', ')}.`
    );
  } else {
    lines.push('No customer distress or mis-selling risk phrases detected.');
  }
  lines.push(`Overall risk band: ${riskBand.toUpperCase()}.`);
  return lines.join(' ');
}

function recommendedAction(riskBand, missingCount) {
  if (riskBand === 'high') return 'escalate_to_compliance';
  if (riskBand === 'medium' || missingCount > 0) return 'coach_agent';
  return 'none';
}

module.exports = { computeRiskScore, buildSummaryText, recommendedAction };
