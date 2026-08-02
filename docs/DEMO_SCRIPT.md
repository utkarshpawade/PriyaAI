# Demo script

Three full call scripts, a mid-call drill, a video shot list, and the checklist to run before the
interview starts.

---

## Pre-interview checklist

Run this **20 minutes before**, not five.

```bash
# 1. Infrastructure
pnpm db:up                      # Postgres on 5433
docker compose ps               # rvagent-postgres → running

# 2. Fresh, known-good data
pnpm db:migrate
pnpm db:seed                    # → "Seeded 5 leads, 5 calls, 39 turns."

# 3. Boot everything
pnpm dev                        # voice :8787 + web :3000

# 4. Confirm what is live
curl -s http://localhost:8787/healthz
#    → check "providers" and "persistence": "postgres"

# 5. Prove the pipeline without touching a microphone
node apps/voice/scripts/smoke-call.mjs
#    → "SMOKE PASS — 11 checks"

# 6. Prove conversation behaviour offline
pnpm eval                       # → "PASS  16/16 scenarios passed"
```

Then, in the browser:

- [ ] Open `http://localhost:3000/demo` **and click the call button once**, so the microphone
      permission prompt is already accepted and the AudioWorklet is warm.
- [ ] Confirm the provider badges in the demo header read what you expect (live vs mock).
- [ ] Hang up, reload, and leave the page open on `/demo`.
- [ ] Open `/leads` in a second tab — it should show five seeded calls.
- [ ] Open `/admin` in a third tab, scrolled to the greeting field.
- [ ] **Type one message in text mode and confirm it works.** This is the fallback if the room is
      noisy or the microphone is captured by the conferencing app.
- [ ] Mute your conferencing app's own noise suppression if possible — it fights the agent's VAD.
- [ ] Headphones on. Without them, laptop speakers feed the agent's voice back into the mic and
      barge-in triggers on the agent itself.

**If the network dies mid-interview:** everything above works offline. Set `LLM_PROVIDER=mock` and
the entire flow — slots, tools, guardrails, summaries, dashboard — still runs.

---

## Call 1 — Hinglish, the happy path (≈ 90 seconds)

The default. Shows language mirroring, slot filling, grounded answers and a site-visit booking.

| You say | What to watch |
|---|---|
| *(click call)* | Agent opens in Hinglish: "Namaste! Main Priya bol rahi hoon, Meridian Group se…" |
| "Haan bataiye" | State badge → **Listening** → **Thinking** → **Speaking** |
| "Mujhe ghar kharidna hai, 2 BHK chahiye Hinjewadi mein" | **Three chips fill at once** — Intent, Configuration, Location. Tool trace shows `set intent, configuration, location` |
| "Budget 75 lakh tak hai" | Budget chip → `₹75 L`. Note "tak" was parsed as a *ceiling*, not a point value |
| "Possession kab tak milega?" | Answer is grounded — tool trace shows `get_project_info(possession)`. The reply carries "expected … as per the current construction plan" |
| "Kya 3 BHK bhi hai? Budget 1.2 crore kar sakta hoon" | **Configuration and Budget chips overwrite.** This is the moment to point at |
| "Theek hai, mera naam Rohit Sharma, number 98210 45566" | Contact captured; phone validated against the Indian mobile series |
| "Haan is Sunday shaam ko aa jaunga" | `schedule_site_visit` resolves "is Sunday shaam" to an actual timestamp |
| *(hang up)* | Open `/leads` → the call is at the top with a score and a bilingual summary |

**Say out loud:** "The chips on the right are the slot state machine, not the model. The LLM phrases
the question; a deterministic tracker decides which question is next. That is why it never re-asks
something you have already answered."

---

## Call 2 — Pure Hindi (≈ 60 seconds)

Set the language selector to **Force Hindi** before starting.

| You say | What to watch |
|---|---|
| *(click call)* | Greeting in Devanagari: "नमस्ते! मैं प्रिया बोल रही हूँ…" |
| "हाँ जी, बताइए" | Turn badge reads **Hindi** |
| "मुझे तीन बीएचके चाहिए" | Configuration → `3BHK`. Devanagari "तीन बीएचके" parsed correctly |
| "बजट एक करोड़ तक है" | Budget → `₹1 Cr`. Spoken Devanagari numeral resolved |
| "पजेशन कब मिलेगा?" | Grounded answer in Devanagari with "possession" and "construction plan" left in Latin |

**Say out loud:** "Hindi output is Devanagari, but the English loanwords stay in Latin script —
'possession', 'budget', '2 BHK'. Every TTS engine we tested reads a Devanagari transliteration of
'possession' badly, and that is what makes the voice sound wrong rather than the accent."

---

## Call 3 — English, investor, off-KB question (≈ 60 seconds)

Set the selector to **Force English**.

| You say | What to watch |
|---|---|
| "I'm looking at a 3 BHK in Kharadi as an investment, around 1.4 crore" | Multiple chips fill; the second project (Meridian Verde) becomes relevant |
| "What rental yield can I expect?" | **The agent refuses to guess** — "I do not have that confirmed, and I would rather not guess." Logged to the follow-up queue |
| "Can you give me a discount?" | "Pricing decisions sit with management, so I cannot promise a discount." No invented offer |
| "Will the price definitely double in five years?" | Guardrail fires. The claim is never spoken |

**Say out loud:** "That refusal is not the prompt being polite. Every property fact has to come back
from a tool call, and there is an output filter that rewrites or blocks guarantees before anything
reaches the speaker."

---

## Drill A — interrupt her mid-sentence

Start a call, ask "Amenities kya kya hain?" — she will start listing them — and **talk over her**
after about two seconds.

Watch: audio stops within a frame, the state badge flips to **Listening**, and the transcript entry
for that turn is tagged **interrupted**. Open `/leads/<call>` afterwards and show the same turn
stored with `[interrupted]` appended.

**Say out loud:** "Three things happen: the client kills its own playback without waiting for the
server, the server aborts both the TTS stream and the LLM generation, and the assistant turn is
truncated to what you actually *heard*. If we stored what the model generated instead, her next turn
would reference things she never said."

---

## Drill B — change the requirement and the budget mid-call

The interviewer will probably ask for this. Mid-conversation, say:

> "Actually 3 BHK dekh lijiye, aur budget 1.5 crore kar sakte hain."

Both chips overwrite in place. Point at the tool trace: `revised configuration, budget`.

Then say **"Kharadi mein dekhna hai"** — the location chip changes and the agent switches to the
second project.

---

## Drill C — change the conversation flow live

This is the one that usually surprises people. Keep `/admin` open in a tab.

1. Change **Greeting — Hinglish** to something obviously different, e.g.
   "Namaste! Priya bol rahi hoon Meridian Group se — ek minute hai aapke paas?"
2. In **Question order**, move **Budget** above **Configuration**.
3. Add a guardrail line: `Never mention competitor projects by name.`
4. Click **Save and activate** → "Saved as version #2. Voice server reloaded — the next call uses
   this version."
5. Go to `/demo`, start a new call. New greeting; budget asked before configuration.
6. Back on `/admin`, click **Activate** on version #1 to roll back.

**Say out loud:** "Each save is a new `AgentConfig` row, not a mutation, so it is auditable and one
click to roll back. A call already in progress keeps the version it started with — swapping persona
mid-sentence produces a visibly inconsistent agent."

---

## Drill D — hostility and opt-out

Say **"mujhe interest nahin hai"**. She thanks you, says she is removing your number, and ends the
call. Show `/leads` — status **Do not call**, score capped.

**Say out loud:** "That is not the model deciding to be graceful. Opt-out and hostility are detected
in code and end the call even if the model does not call `end_call`. It is a compliance behaviour,
so it cannot be left to a prompt."

---

## If you have 30 seconds and no microphone

Run `pnpm eval` on screen. Sixteen scripted conversations through the real orchestrator, offline,
with a pass/fail table — pure Hindi, Hinglish, English, mid-call revision, hostile caller, opt-out,
wrong number, off-KB question, discount, loan, silence. It is the most information-dense thing in the
project per second of screen time.

---

## Video shot list

Target 4–5 minutes.

| # | Shot | Seconds | Rubric point |
|---|---|---|---|
| 1 | Landing page, scroll to the real-vs-simulated table | 20 | Honesty; scope is stated up front |
| 2 | Call 1 (Hinglish happy path), full | 90 | Natural conversation, qualification, grounded answers |
| 3 | Split screen: transcript filling on the left, requirements chips on the right | *(within #2)* | Understanding is visible, not asserted |
| 4 | Drill A — interrupt her, show the `interrupted` tag | 25 | **Handles interruptions** |
| 5 | Drill B — change requirement + budget mid-call | 25 | **Handles changing requirements** |
| 6 | Call 2 (Hindi) — 20 seconds, then Call 3 (English) — 20 seconds | 40 | Multilingual |
| 7 | Off-KB question and the refusal | 20 | No hallucination |
| 8 | Opt-out → call ends warmly → `/leads` shows Do not call | 20 | Robustness and compliance |
| 9 | `/leads/[id]`: transcript, tool trace, latency per turn, bilingual summary | 30 | Data storage and summarisation |
| 10 | `/admin`: change the greeting and question order, save, start a new call | 35 | **Modify the flow without a redeploy** |
| 11 | Terminal: `pnpm eval` → 16/16 | 20 | Testing rigour |
| 12 | Architecture diagram, 15 seconds on the transport-agnostic core | 20 | Engineering judgement |

---

## Questions to be ready for mid-demo

Short answers here; the long ones are in [INTERVIEW_NOTES.md](INTERVIEW_NOTES.md).

- **"Where is the lead data stored?"** → Postgres via Prisma. Show `/leads/[id]`, then
  `packages/db/prisma/schema.prisma`. Lead, Call, Turn, Summary, SiteVisit, FollowUp, AgentConfig.
- **"Is that a real project?"** → No. Two fictional projects, RERA IDs are placeholders in MahaRERA
  format. It says so on the landing page, in the KB file, and in the system prompt.
- **"Can it actually call my phone?"** → The Twilio Media Streams path is implemented and runs on the
  same agent core, but the number is not provisioned — Indian numbers need a regulatory bundle and
  DLT registration. Exotel or Plivo in production. It is in LIMITATIONS.md.
- **"What is real right now?"** → Point at the provider badges in the demo header, or
  `curl /healthz`.
