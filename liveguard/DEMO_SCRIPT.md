# 5-Minute Demo Video — Script / Storyboard

This project includes the source and a live, runnable demo; it does not include an
actual recorded video file (no screen-recording capability here). Use this script to
record it — it's timed to fit 5 minutes and is written to work with the app exactly as
built.

## Setup before recording
- Start the backend: `npm start` in `server/` (Postgres running + `.env` configured).
- Open two browser windows side by side: **Agent** (left) and **Customer** (right).
- Have `docs/architecture.png` and `presentation/LiveGuard_Presentation.pptx` open in
  other tabs to cut to.

---

### 0:00–0:40 — The problem (voiceover over architecture diagram or title slide)
> "BFSI phone sales — loans, insurance, credit cards — are legally required to disclose
> specific terms and avoid mis-selling. Today, compliance is checked *after* the call,
> by manually auditing a small sample of recordings. By the time a problem is found,
> the regulatory fine, the complaint, the mis-sold product — it's already happened.
> LiveGuard checks compliance *while the call is still happening*."

### 0:40–1:15 — Architecture, fast
> Show `docs/architecture.png`. "Two browser tabs place a real WebRTC call — agent and
> customer. Each side streams its own speech to text. The agent's words go through a
> deterministic rule engine — five real disclosure rules, pattern-matched, fully
> explainable. The customer's words go through a narrow LLM classifier that watches for
> risk signals like affordability stress or a 'guaranteed return' claim. Both feed
> nudges back to the agent in real time."

### 1:15–3:30 — Live demo (the core of the video)
1. Click **Join as Agent** in the left window. Show the Call ID.
2. Paste the same Call ID into the right window, click **Join as Customer**.
3. Grant mic permission in both. Point out the `live` badge once WebRTC connects —
   *this is a real peer-to-peer audio call, not a mock.*
4. **Agent says:** *"Hi, thanks for calling. Just so you know, this call is being
   recorded for quality purposes."*
   → Point at the sidebar: the "Call recording consent" item ticks to satisfied
   immediately.
5. **Agent says:** *"I'd like to walk you through the personal loan you applied for."*
   (no fee/interest mentioned yet) — wait ~90 seconds of talking or fast-forward the
   SLA timers in `rulesEngine.js` for the recording — a **nudge appears**: "Missing
   disclosure: interest rate."
6. **Agent says:** *"The interest rate is 11.5% per annum, and there's a one-time
   processing fee of 1.5%."* → both checklist items tick green live.
7. **Customer says:** *"Honestly, I'm not sure I can afford this right now."*
   → a **risk-phrase nudge** appears on the agent's screen instantly: "Customer signalled
   affordability stress — pause the pitch, consider a retention/eligibility review."
   *This is the moment to freeze the video on — it's the differentiator.*
8. Click **End Call**. Show the **post-call summary modal**: risk score, risk band,
   plain-English summary — *this is what gets stored to Postgres for the supervisor to
   review later.*

### 3:30–4:15 — Why this is hard (engineering judgment)
> "Three things make this non-trivial: latency — the nudge has to appear while the
> conversation is still relevant, not a minute later. False-positive tuning — nudge the
> agent too often on things that don't matter and they'll ignore all of it, including
> the disclosures that matter. And explainability — a BFSI compliance system can't be a
> black box; every nudge in this system traces back to either a literal phrase match or
> a labeled LLM classification, logged in `compliance_events` for audit."

### 4:15–4:45 — Scope, honestly
> "We scoped this deliberately: five real disclosure rules instead of a full
> regulatory library, one language, and a browser-to-browser WebRTC call instead of a
> real telephony integration. Every one of those is a data or integration change, not a
> redesign — the reasoning is in ASSUMPTIONS.md."

### 4:45–5:00 — Close
> "LiveGuard — catching the compliance problem while it's still a conversation, not
> after it's a complaint." (End on title slide / GitHub repo URL.)
