# AI Tools Used

Disclosed per submission requirements.

## In the product itself

| Component | Tool | Role |
|---|---|---|
| Speech-to-text | **Browser Web Speech API** (`webkitSpeechRecognition`) | Streaming transcription of both agent and customer audio, client-side. Chosen over a server-side STT API (e.g. Whisper, Deepgram, Google STT) specifically to keep the demo runnable with zero external API keys / network dependencies while still being a genuine streaming-STT integration, not a mock. Swapping in a server-side provider is a drop-in change at the point where `app.js` currently calls the Web Speech API. |
| Soft-signal detection (sentiment / mis-selling risk phrases) | **Anthropic Claude (Messages API, `claude-sonnet-4-6`)**, with a local keyword-heuristic fallback when no API key is configured | Classifies customer utterances into risk categories (affordability stress, possible mis-selling claim, confusion, cancellation intent, pressure/complaint). This is the one place in the pipeline an LLM is used — mandatory compliance disclosures are deliberately kept deterministic/rule-based instead (see `ASSUMPTIONS.md` for why). |

No other AI/ML models are embedded in the running system — the disclosure rule engine
and risk-scoring formula are both plain deterministic code, on purpose (auditability).

## In building this submission

Claude (Anthropic) was used as a development assistant to help scaffold and write the
source code, documentation, database schema, architecture diagram, and presentation
deck in this repository, based on the project brief. All code should be reviewed,
tested against a real Postgres instance and real call audio, and security-reviewed
before any real-world use — it has not been penetration-tested or validated against
real regulatory text by a compliance professional.
