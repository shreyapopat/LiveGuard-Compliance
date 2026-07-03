const pptxgen = require('pptxgenjs');

const NAVY = '0B1622';
const SLATE = '16253A';
const SLATE2 = '223652';
const TEAL = '16C7A6';
const TEAL_DK = '0E7A63';
const AMBER = 'F2A93B';
const RED = 'E5484D';
const TEXT = 'E7EEF6';
const MUTED = '8CA0B8';
const WHITE = 'FFFFFF';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.3 x 7.5
pres.author = 'LiveGuard Team';
pres.title = 'LiveGuard — Real-Time Compliance & Risk Co-Pilot';

const FONT_HEAD = 'Cambria';
const FONT_BODY = 'Calibri';

function bgSlide(dark = true) {
  const s = pres.addSlide();
  s.background = { color: dark ? NAVY : WHITE };
  return s;
}

function eyebrow(s, text, color = TEAL) {
  s.addText(text.toUpperCase(), {
    x: 0.6, y: 0.45, w: 8, h: 0.35, fontFace: FONT_BODY, fontSize: 12, bold: true,
    color, charSpacing: 2,
  });
}

// ---------------- Slide 1: Title ----------------
{
  const s = bgSlide(true);
  s.addShape(pres.shapes.OVAL, { x: 9.6, y: -2.0, w: 6, h: 6, fill: { color: TEAL, transparency: 88 }, line: { type: 'none' } });
  s.addShape(pres.shapes.OVAL, { x: -2.0, y: 4.5, w: 5, h: 5, fill: { color: TEAL, transparency: 92 }, line: { type: 'none' } });

  s.addText('◆ LIVEGUARD', { x: 0.7, y: 2.15, w: 8, h: 0.5, fontFace: FONT_BODY, fontSize: 14, bold: true, color: TEAL, charSpacing: 3 });
  s.addText('A compliance co-pilot that listens during\nthe call — not after it.', {
    x: 0.7, y: 2.65, w: 10.8, h: 1.9, fontFace: FONT_HEAD, fontSize: 40, bold: true, color: WHITE, lineSpacing: 46,
  });
  s.addText('Real-time compliance & mis-selling risk detection for BFSI call centers\nConversational AI · WebRTC · Security & Compliance', {
    x: 0.7, y: 4.7, w: 10, h: 0.8, fontFace: FONT_BODY, fontSize: 15, color: MUTED, lineSpacing: 22,
  });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 5.55, w: 0.55, h: 0.06, fill: { color: TEAL }, line: { type: 'none' } });
}

// ---------------- Slide 2: The problem ----------------
{
  const s = bgSlide(false);
  eyebrow(s, 'The Problem');
  s.addText('Compliance is checked after the damage is already done', {
    x: 0.6, y: 0.85, w: 11.8, h: 0.9, fontFace: FONT_HEAD, fontSize: 28, bold: true, color: NAVY,
  });

  const steps = [
    ['1', 'Agent runs the sales call', 'A loan, insurance, or credit card pitch happens over the phone, live, with no real-time oversight.'],
    ['2', 'Call is recorded and filed', 'Only a small sample of recordings — often <5% — is ever reviewed at all.'],
    ['3', 'Manual audit happens days later', 'A compliance analyst listens back, if the call is even selected for review.'],
    ['4', 'Violation is found — too late', 'Regulatory fine, customer complaint, or mis-sold product has already happened.'],
  ];
  const colW = 2.85, gap = 0.25, startX = 0.6, y = 2.15;
  steps.forEach((st, i) => {
    const x = startX + i * (colW + gap);
    const fill = i === 3 ? { color: RED, transparency: 88 } : { color: SLATE2, transparency: 92 };
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: colW, h: 3.6, rectRadius: 0.08, fill, line: { color: i===3?RED:'D7DEE5', width: 1 }, shadow: { type: 'outer', color: '000000', blur: 8, offset: 3, angle: 90, opacity: 0.08 } });
    s.addText(st[0], { x: x + 0.2, y: y + 0.2, w: 1, h: 0.6, fontFace: FONT_HEAD, fontSize: 30, bold: true, color: i===3?RED:TEAL_DK });
    s.addText(st[1], { x: x + 0.2, y: y + 0.95, w: colW - 0.4, h: 0.9, fontFace: FONT_BODY, fontSize: 14.5, bold: true, color: NAVY, lineSpacing: 18 });
    s.addText(st[2], { x: x + 0.2, y: y + 1.85, w: colW - 0.4, h: 1.6, fontFace: FONT_BODY, fontSize: 11.5, color: '4A5A6B', lineSpacing: 16 });
    if (i < 3) s.addText('→', { x: x + colW + 0.02, y: y + 1.5, w: 0.25, h: 0.5, fontSize: 18, color: MUTED, align: 'center' });
  });
  s.addText('Nobody catches it while the call is still happening.', {
    x: 0.6, y: 6.0, w: 11, h: 0.5, fontFace: FONT_BODY, italic: true, fontSize: 15, color: TEAL_DK,
  });
}

// ---------------- Slide 3: Solution ----------------
{
  const s = bgSlide(true);
  eyebrow(s, 'The Solution');
  s.addText('LiveGuard nudges the agent while the call is live', {
    x: 0.6, y: 0.85, w: 11.8, h: 0.7, fontFace: FONT_HEAD, fontSize: 28, bold: true, color: WHITE,
  });

  const cards = [
    ['🎧', 'Streaming transcription', 'Both sides of the call are transcribed live as they speak — not after the call ends.'],
    ['✓', 'Explainable rule engine', 'Deterministic checks for mandatory disclosures. Every nudge traces to a literal phrase match — auditable by design.'],
    ['⚠', 'LLM risk detection', 'A narrow LLM layer flags softer signals: affordability stress, confusion, mis-selling language — the things a keyword can\'t catch.'],
    ['📋', 'Live agent sidebar', 'A real-time checklist + nudge feed the agent actually sees and acts on, mid-call.'],
  ];
  const colW = 2.75, gap = 0.22, startX = 0.6, y = 2.0;
  cards.forEach((c, i) => {
    const x = startX + i * (colW + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: colW, h: 3.9, rectRadius: 0.08, fill: { color: SLATE }, line: { color: SLATE2, width: 1 } });
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.25, w: 0.6, h: 0.6, fill: { color: TEAL, transparency: 82 }, line: { type: 'none' } });
    s.addText(c[0], { x: x + 0.2, y: y + 0.25, w: 0.6, h: 0.6, fontSize: 20, align: 'center', valign: 'middle', color: TEAL });
    s.addText(c[1], { x: x + 0.2, y: y + 1.05, w: colW - 0.4, h: 0.8, fontFace: FONT_BODY, fontSize: 14.5, bold: true, color: WHITE, lineSpacing: 18 });
    s.addText(c[2], { x: x + 0.2, y: y + 1.85, w: colW - 0.4, h: 1.9, fontFace: FONT_BODY, fontSize: 11.5, color: MUTED, lineSpacing: 16 });
  });
}

// ---------------- Slide 4: Architecture (image) ----------------
{
  const s = bgSlide(false);
  eyebrow(s, 'Architecture');
  s.addText('Signaling, transcription, and the rule engine, end to end', {
    x: 0.6, y: 0.85, w: 11.8, h: 0.6, fontFace: FONT_HEAD, fontSize: 24, bold: true, color: NAVY,
  });
  s.addImage({ path: '../docs/architecture.png', x: 1.1, y: 1.6, w: 11.1, h: 5.6, sizing: { type: 'contain', w: 11.1, h: 5.6 } });
}

// ---------------- Slide 5: Why unique / defensible ----------------
{
  const s = bgSlide(true);
  eyebrow(s, 'Why This, Why Now');
  s.addText('Live-during-the-call is the differentiator', {
    x: 0.6, y: 0.85, w: 11.8, h: 0.6, fontFace: FONT_HEAD, fontSize: 28, bold: true, color: WHITE,
  });

  const rows = [
    ['Not a post-call dashboard', 'Listens to an ongoing call and nudges the agent live — "you haven\'t disclosed the processing fee yet" — while there\'s still time to fix it.'],
    ['Tight domain fit', 'Combines conversational AI, WebRTC, and security/compliance in one system, for a BFSI-specific problem — not a generic support bot.'],
    ['Genuinely hard to get right', 'Latency, streaming transcription accuracy, and false-positive tuning are real engineering constraints, not hand-waved.'],
  ];
  let y = 2.1;
  rows.forEach((r) => {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: y + 0.08, w: 0.05, h: 1.1, fill: { color: TEAL }, line: { type: 'none' } });
    s.addText(r[0], { x: 0.95, y, w: 11, h: 0.45, fontFace: FONT_BODY, fontSize: 16, bold: true, color: TEAL });
    s.addText(r[1], { x: 0.95, y: y + 0.42, w: 10.8, h: 0.7, fontFace: FONT_BODY, fontSize: 13, color: MUTED, lineSpacing: 17 });
    y += 1.5;
  });
}

// ---------------- Slide 6: 5 compliance rules ----------------
{
  const s = bgSlide(false);
  eyebrow(s, 'What It Actually Checks');
  s.addText('Five real disclosure & conduct rules', {
    x: 0.6, y: 0.85, w: 11.8, h: 0.6, fontFace: FONT_HEAD, fontSize: 26, bold: true, color: NAVY,
  });
  s.addText('Scoped deliberately — not a comprehensive regulatory library. Rules live as data, so adding more is a data-entry task, not a code change.', {
    x: 0.6, y: 1.4, w: 11.6, h: 0.5, fontFace: FONT_BODY, fontSize: 12.5, italic: true, color: '4A5A6B',
  });

  const rules = [
    ['LOAN_PROCESSING_FEE', 'Loan', 'Deterministic', 'High', TEAL_DK],
    ['LOAN_INTEREST_RATE', 'Loan', 'Deterministic', 'Critical', RED],
    ['INSURANCE_FREE_LOOK', 'Insurance', 'Deterministic', 'Critical', RED],
    ['CALL_RECORDING_CONSENT', 'All products', 'Deterministic', 'Medium', AMBER],
    ['MIS_SELLING_RISK_PHRASE', 'All products', 'LLM-assisted', 'High', TEAL_DK],
  ];
  let y = 2.15;
  const rowH = 0.78;
  s.addText(['Rule', 'Product', 'Detection', 'Severity'].join('     '), { x: 0.6, y: 1.95, w: 11.6, h: 0.01 }); // spacer, invisible
  const colX = [0.6, 5.3, 7.6, 9.7];
  ['RULE ID', 'PRODUCT', 'DETECTION', 'SEVERITY'].forEach((h, i) => {
    s.addText(h, { x: colX[i], y: 1.95, w: i === 0 ? 4.5 : 2, h: 0.3, fontFace: FONT_BODY, fontSize: 10, bold: true, color: MUTED, charSpacing: 1 });
  });
  rules.forEach((r, i) => {
    const ry = y + i * rowH;
    if (i % 2 === 0) s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: ry - 0.06, w: 11.6, h: rowH, fill: { color: 'F4F8FA' }, line: { type: 'none' } });
    s.addText(r[0], { x: colX[0], y: ry, w: 4.5, h: 0.5, fontFace: 'Consolas', fontSize: 12.5, bold: true, color: NAVY, valign: 'middle' });
    s.addText(r[1], { x: colX[1], y: ry, w: 2, h: 0.5, fontFace: FONT_BODY, fontSize: 12, color: '4A5A6B', valign: 'middle' });
    s.addText(r[2], { x: colX[2], y: ry, w: 2, h: 0.5, fontFace: FONT_BODY, fontSize: 12, color: '4A5A6B', valign: 'middle' });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: colX[3], y: ry + 0.06, w: 1.3, h: 0.36, rectRadius: 0.18, fill: { color: r[4], transparency: 85 }, line: { type: 'none' } });
    s.addText(r[3], { x: colX[3], y: ry + 0.06, w: 1.3, h: 0.36, fontFace: FONT_BODY, fontSize: 10.5, bold: true, color: r[4], align: 'center', valign: 'middle' });
  });
}

// ---------------- Slide 7: Scoped out ----------------
{
  const s = bgSlide(true);
  eyebrow(s, 'Honest Scoping', AMBER);
  s.addText('What we deliberately left out — and why it\'s safe to', {
    x: 0.6, y: 0.85, w: 11.8, h: 0.55, fontFace: FONT_HEAD, fontSize: 25, bold: true, color: WHITE,
  });

  const items = [
    ['Real PBX / telephony integration', 'Simulated as a browser-to-browser WebRTC call. The hard part — the real-time analysis pipeline — is provider-agnostic; swapping in Twilio/Exotel is an integration task, not a redesign.'],
    ['Multi-language support', 'English only for this build. Noted as the top v2 priority for a market like India.'],
    ['Full regulatory rule library', 'Five realistic rules across two product types instead of an exhaustive catalogue. Rules are data-driven (JSON patterns in Postgres), so scaling the catalogue is a compliance-team task, not an engineering one.'],
  ];
  let y = 1.9;
  items.forEach((it) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 11.6, h: 1.5, rectRadius: 0.08, fill: { color: SLATE }, line: { color: SLATE2, width: 1 } });
    s.addText(it[0], { x: 0.95, y: y + 0.16, w: 11, h: 0.4, fontFace: FONT_BODY, fontSize: 15, bold: true, color: AMBER });
    s.addText(it[1], { x: 0.95, y: y + 0.6, w: 10.9, h: 0.8, fontFace: FONT_BODY, fontSize: 12, color: MUTED, lineSpacing: 16 });
    y += 1.75;
  });
}

// ---------------- Slide 8: Scoring fit ----------------
{
  const s = bgSlide(false);
  eyebrow(s, 'Scoring Fit');
  s.addText('Mapped directly to the evaluation weighting', {
    x: 0.6, y: 0.85, w: 11.8, h: 0.6, fontFace: FONT_HEAD, fontSize: 26, bold: true, color: NAVY,
  });

  const rows = [
    ['Business Understanding', '15%', 'Named BFSI domain + named tech (WebRTC) straight from the brief — not a generic bot retrofitted to the theme.'],
    ['Innovation', '20%', 'Live-during-the-call detection is the differentiator against the inevitable wave of post-call "AI support bot" submissions.'],
    ['Solution Design / NFR', '15%', 'Latency handling, full audit trail, explainable rule engine — a real security/compliance conversation, not hand-waved.'],
    ['Presentation', '10%', 'A live call with a nudge popping up on screen is inherently more compelling on video than a form-filling app.'],
  ];
  let y = 2.05;
  rows.forEach((r) => {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: y - 0.05, w: 11.6, h: 1.05, fill: { color: 'F4F8FA' }, line: { type: 'none' } });
    s.addText(r[1], { x: 0.75, y, w: 1.1, h: 0.9, fontFace: FONT_HEAD, fontSize: 26, bold: true, color: TEAL_DK, valign: 'middle' });
    s.addText(r[0], { x: 2.0, y: y + 0.05, w: 3.1, h: 0.8, fontFace: FONT_BODY, fontSize: 14, bold: true, color: NAVY, valign: 'middle' });
    s.addText(r[2], { x: 5.2, y: y + 0.05, w: 6.8, h: 0.85, fontFace: FONT_BODY, fontSize: 11.5, color: '4A5A6B', valign: 'middle', lineSpacing: 15 });
    y += 1.2;
  });
}

// ---------------- Slide 9: Closing ----------------
{
  const s = bgSlide(true);
  s.addShape(pres.shapes.OVAL, { x: -2.5, y: -2.5, w: 7, h: 7, fill: { color: TEAL, transparency: 90 }, line: { type: 'none' } });
  s.addText('◆ LIVEGUARD', { x: 0.7, y: 2.6, w: 8, h: 0.5, fontFace: FONT_BODY, fontSize: 14, bold: true, color: TEAL, charSpacing: 3 });
  s.addText('Catch it while it\'s still a conversation —\nnot after it\'s a complaint.', {
    x: 0.7, y: 3.1, w: 11, h: 1.6, fontFace: FONT_HEAD, fontSize: 32, bold: true, color: WHITE, lineSpacing: 40,
  });
  s.addText('Source code · working demo · architecture · API docs · DB schema — all included in the submission repo.', {
    x: 0.7, y: 4.9, w: 10.5, h: 0.6, fontFace: FONT_BODY, fontSize: 13, color: MUTED,
  });
}

pres.writeFile({ fileName: 'LiveGuard_Presentation.pptx' }).then(() => console.log('done'));
