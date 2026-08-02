# Limitations — what is functional and what is simulated

Being precise about this is more useful than claiming everything works. The table below is the same
one rendered on the landing page, so a reviewer sees it before they see the demo.

## Functional

| Capability | Notes |
|---|---|
| **Browser voice call** | Full duplex over WebSocket. `getUserMedia` → AudioWorklet → PCM16 mono 24 kHz → 20 ms binary frames. No MediaRecorder, no container overhead. |
| **Barge-in / interruption** | Energy VAD with hysteresis in the worklet (~60 ms to trigger). Aborts the TTS stream and the LLM generation, flushes client playback, truncates the assistant turn to what was actually spoken and marks it `[interrupted]`. |
| **STT → LLM → TTS pipeline** | Streaming end to end. Sentences are synthesised while the model is still generating. |
| **Language detection and mirroring** | Per-turn classifier (`hi` / `hi-en` / `en`), stored on every turn row, mirrored in the reply, switches mid-call. Forced modes available from the demo UI. |
| **Slot extraction and qualification** | LLM tool calls plus a deterministic parser backstop. Handles revisions, refusals, one-word answers, budgets as ranges/ceilings/spoken numerals, Indian phone numbers including spoken and Devanagari digits. |
| **Knowledge-base grounding** | Every property fact goes through a tool call against a zod-validated KB. Unknown questions are refused and logged for follow-up. |
| **Guardrails** | Nine enforced rules; rewrites or blocks guarantees, forces "indicative" on prices and "expected" on timelines. Enforced in all three languages. |
| **Postgres persistence** | Leads, calls, per-turn transcripts with latency metrics and tool traces, summaries, site visits, follow-ups, versioned agent config. |
| **Call summaries** | Structured JSON validated by zod, plus 4–6 line narratives in English *and* Hindi. Deterministic template when no LLM key is present. |
| **Dashboard** | Filterable lead table, full call detail with tool trace, editable lead fields, CSV and JSON export, `GET /api/calls/:id/summary`. |
| **Live config editing** | `/admin` writes a new `AgentConfig` version and pushes a reload. Persona, greetings, guardrails, question order and KB fields change without a redeploy. |
| **Zero-key operation** | With an empty `.env` the browser transcribes locally, `MockLLM` drives the flow, and the browser speaks. The full conversation, slot extraction, guardrails and persistence all still run. |

## Depends on credentials

| Capability | With a key | Without |
|---|---|---|
| Speech to text | Deepgram `nova-3` (`language=multi` for Hinglish) or Sarvam Saarika | Browser Web Speech API, or `MockSTT` replaying a script against a real VAD |
| Language model | Gemini 2.5 Flash (default), GPT-4o-mini, or Claude Haiku 4.5 | `MockLLM` — deterministic, rule-based, drives the *same* orchestrator and tools |
| Text to speech | Sarvam Bulbul v2 or ElevenLabs Flash v2.5 | Browser `speechSynthesis`, or `MockTTS` emitting a tone of the correct duration at real speaking pace |

The active provider is logged on boot, returned by `/healthz`, and shown as a badge in the demo
header. Nothing is ever silently mocked.

## Simulated

| Capability | What actually happens | What a production version needs |
|---|---|---|
| **Outbound and inbound phone calls** | Twilio Programmable Voice + Media Streams is implemented end to end: `POST /twilio/incoming` returns `<Connect><Stream>` TwiML, `/twilio/stream` bridges μ-law 8 kHz ↔ PCM 24 kHz through the same agent core, webhook signatures are validated, and `/admin` can trigger an outbound call. **The number is not provisioned.** | An Indian Twilio number requires a regulatory bundle (address proof, business documents) and, for outbound commercial calling, DLT registration under TRAI rules plus scrubbing against the DND registry. **Exotel** and **Plivo** are India-native alternatives with materially less friction for Indian numbers and are what I would use in production. |
| **Site-visit booking** | Parses the caller's own words ("kal shaam", "this Sunday"), resolves them against a supplied clock, writes a `SiteVisit` row and confirms verbally. | A real calendar (Google Calendar / CRM availability), sales-rep assignment, and a confirmation SMS/WhatsApp. |
| **CRM push** | Leads live in Postgres and export as CSV/JSON. | A connector to Salesforce / LeadSquared / Zoho, which is what Indian developers actually run. |
| **Project data** | Two fictional projects — **Aureva Skyline** (Hinjewadi Phase 2) and **Meridian Verde** (Kharadi). Every price, date, distance and amenity is invented. RERA IDs are placeholders in MahaRERA format and are **not real registrations**. | A feed from the developer's inventory system, with live availability and locked pricing. |
| **Inventory and pricing** | A static array of units with an availability flag. `check_matching_units` is a real search over it, including the honest "these are above your budget" path. | A pricing engine with holds, blocks, floor-rise, PLC and approval workflow. |
| **Call recording** | `Call.recordingUrl` exists in the schema but nothing is written to it. | Object storage plus explicit consent capture, which in India means an announcement at call start. |
| **Authentication** | The dashboard and `/admin` are unauthenticated. | SSO for the sales team and role separation between agent config and lead data. |

## Known rough edges

- **`MockTTS` runs at real speaking pace on purpose** so barge-in timing and the jitter buffer behave
  realistically. It means a mock-mode demo takes as long as a real conversation.
- **`sttMs` includes the endpoint hold.** That is intentional — it is the latency the caller feels —
  but it makes the number look worse than a provider's own benchmark.
- **The Sarvam STT adapter buffers per utterance** because the REST endpoint is not streaming. It
  pays one network round trip after end-of-speech that Deepgram does not. Deepgram is the better
  choice for latency; Sarvam is the better choice for Hinglish accuracy.
- **`browser` STT means the server never sees audio** on that path, so the phone transport cannot use
  it. With no keys at all, the phone path has no transcription.
- **No speaker diarisation.** A second person on the line is transcribed as the same caller.
- **The language classifier is rule-based.** It is fast and predictable, but a heavily
  transliterated sentence with no function words falls back to the previous turn's language.

## Deliberately out of scope

Multi-tenant developer accounts, A/B testing of scripts, campaign management, dialer pacing, agent
handoff to a human mid-call, and call-quality scoring. Each is a product surface rather than a
missing piece of this one.
