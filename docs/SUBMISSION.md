# Submission

| Field | Value |
|---|---|
| **Candidate name** | Utkarsh Sharma |
| **Live demo URL** | `_______________________` *(Vercel — see Deployment below)* |
| **Voice demo link** | `_______________________` *(the `/demo` page of the live URL)* |
| **Video demo link** | `_______________________` *(shot list in [DEMO_SCRIPT.md](DEMO_SCRIPT.md))* |
| **GitHub link** | `_______________________` |
| **Submitted** | `____ / ____ / 2026` |

---

## Tools and technologies

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict), Node 20+, ESM | One language across agent, server and UI; zod at every I/O edge |
| Monorepo | pnpm workspaces + Turborepo | Shared protocol and audio utilities without publishing packages |
| Realtime server | Fastify 5 + `ws` | Long-lived sockets; Fastify's plugin model keeps transports isolated |
| Web | Next.js 15 (App Router), React 19, Tailwind v4 | Server components for the dashboard, one client island for the demo |
| Database | Postgres 16 + Prisma 6 | Relational data (lead → call → turn) with typed access |
| Validation | zod | Single source of truth for slots, the WS protocol, the KB and summaries |
| Testing | Vitest, Playwright, custom conversation eval | 108 unit tests, 16 scripted conversations, one browser smoke test |
| CI | GitHub Actions | typecheck · lint · test · eval · build, plus a Playwright job |

## AI model used

- **Default LLM: Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via the Generative Language REST API
  with streaming and function calling. Chosen for latency, cost, and noticeably better Hinglish than
  alternatives at the same price point.
- **Alternatives implemented:** OpenAI `gpt-4o-mini`, Anthropic `claude-haiku-4-5`.
- **Offline: `MockLLM`** — a deterministic rule-based responder driven by the same slot schema and
  the same six tools. It is not a stub; it runs the full orchestrator and is what `pnpm eval` tests.

## Voice and calling platform

- **STT:** Deepgram `nova-3` with `language=multi` (streaming WebSocket; Deepgram specifically
  recommends `endpointing=100` for code-switching) · Sarvam Saarika · browser Web Speech · mock.
- **TTS:** Sarvam Bulbul v2 (Indian-accented Hindi/Hinglish) · ElevenLabs Flash v2.5 · browser
  `speechSynthesis` · mock.
- **Telephony:** Twilio Programmable Voice + Media Streams, implemented against the same agent core.
  **Functional but not provisioned** — see [LIMITATIONS.md](LIMITATIONS.md). The browser voice demo
  is the primary demo.

Every provider's request/response shape was read from the current official documentation while
building, not from memory. That caught real drift: Sarvam's TTS field is `language_code`, not
`target_language_code` as older examples show.

---

## How the conversation flow was created

**A hybrid: an LLM for language, a state machine for control.**

Pure prompt-driven agents wander — they re-ask answered questions, loop on refusals, and drift off
the qualification path. Pure state machines sound like an IVR. So responsibility is split:

- **`QualificationTracker` decides *what* to ask.** It owns the slots, the declined set, the ask
  counts and the question order, and exposes `nextSlot()`. The LLM is *told* what is outstanding; it
  does not choose.
- **The LLM decides *how* to say it.** Persona, acknowledgement, register, and the phrasing of the
  answer are entirely the model's.

Building it, in order:

1. **Slots first.** A zod schema in `packages/shared` — deliberately shared, because the same shape
   crosses the agent, the WebSocket, the Prisma row and the React panel. One schema keeps four
   surfaces in step.
2. **Knowledge base second.** Two fictional projects, zod-validated at module load, with an
   `IS_FICTIONAL` marker threaded into the prompt and the UI. Writing the KB before the prompt forced
   the question "what is the agent actually allowed to say?" to be answered structurally.
3. **Tools third.** Six: `update_requirements`, `get_project_info`, `check_matching_units`,
   `schedule_site_visit`, `capture_contact`, `end_call`. Each has a zod schema (the enforcement
   boundary) and a hand-written JSON Schema, because the three LLM providers accept different subsets
   of JSON Schema and generating the intersection is more fragile than maintaining six small objects.
4. **Prompt fourth**, as a versioned markdown file (`packages/agent/prompts/sales-agent.md`) with
   `{{PLACEHOLDERS}}` filled at runtime from the live slot state, the KB summary and the active
   config. A build step compiles it to a constant; a unit test fails if the two drift.
5. **Mocks before real providers.** `MockLLM` was written before any live adapter. That meant the
   entire flow — tools, guardrails, persistence, summaries — was demoable and testable offline from
   day one, and the eval suite has meaning independent of a network connection.
6. **Robustness cases as tests, not as prompt lines.** Opt-out, hostility, wrong number, "who is
   this?", "are you a bot?", discount demands, loan questions, silence, declined slots and mid-call
   revisions are each a scenario in `pnpm eval`. Opt-out and hostility are additionally enforced in
   code — the session ends the call even if the model does not call `end_call`.

The **phrasebook** (`packages/agent/src/language/phrasebook.ts`) holds hand-written sales-executive
phrasing for all three registers. It drives `MockLLM` and supplies style examples to the live prompt,
which is what stops the agent sounding like a translated script.

---

## Challenges faced

**JavaScript's `\b` does not work with Devanagari.** Word boundaries are defined against the ASCII
word class, so `/\bखरीद\b/` never matches — every Hindi rule in the NLU layer and, worse, every Hindi
*guardrail* was silently dead. The eval caught it (a pure-Hindi scenario extracted zero slots). Fixed
with a `wordPattern()` helper using `(?<![\p{L}\p{N}\p{M}])` lookarounds. The `\p{M}` matters
separately: Devanagari vowel signs are combining marks, and a punctuation stripper that dropped them
turned "करोड़" into "करड".

**Budget parsing is a semantic problem, not a regex problem.** "3 BHK dekh lijiye, aur budget 1.5
crore" parsed as a *range* from 3 crore to 1.5 crore, because "aur" looks like a range separator and
"3" looks like a figure. Fixed by discarding figures attached to non-currency units (BHK, sq ft) and
capping how far apart two numbers can be and still form a range.

**Barge-in has to be truthful about history.** Aborting audio is the easy half. If the assistant turn
is stored as what the model *generated* rather than what the caller *heard*, the next turn references
things that were never said. The speech queue now confirms each chunk after it is emitted, and the
turn is truncated to that.

**Latency is mostly waiting on purpose.** The largest single component is the endpoint hold — the
silence you wait through before believing the turn ended. Reporting `sttMs` from the last voiced
frame rather than from the provider's own clock made that visible instead of hiding it.

**Making mocks genuinely useful.** It would have been easier to make `MockTTS` return silence
instantly. Emitting a tone of the correct duration at real speaking pace means barge-in, the jitter
buffer and the "agent is speaking" state all behave the way they will with a real voice — the timing
in a mock-mode demo is real, only the words are canned.

**Windows build environment.** Next's webpack pipeline globs upward out of the repository and hits
protected profile junctions (`C:\Users\<name>\Cookies`), failing the build with an opaque `EPERM`.
Isolated by instrumenting the bundled glob in the build workers; resolved by building with Turbopack,
which is stable for builds in Next 15.5.

---

## Next version

1. **Cut latency to sub-800 ms.** Prompt caching for the constant system prefix, speculative TTS on
   the first clause, and a shorter adaptive endpoint hold that shrinks when the caller is speaking
   fluently and grows when they hesitate.
2. **Replace the rule-based language classifier** with a small on-device model. The current one is
   fast and predictable but gives up on transliterated sentences with no function words.
3. **Real telephony on an India-native provider.** Exotel or Plivo rather than Twilio, with DLT
   registration and DND scrubbing built into the campaign layer rather than bolted on.
4. **Retrieval over the KB** instead of topic lookup. Twenty FAQ pairs per project is fine; two
   hundred projects needs embeddings plus a reranker, with the same "no tool result, no claim" rule.
5. **Learn from outcomes.** Every call already stores slots, objections and outcome. That is a
   training set for scoring which openers and objection responses actually convert, which is the
   feature a sales head would ask for first.
6. **Human handoff mid-call.** Warm transfer when the caller asks for a person or the agent hits a
   third unanswerable question, with the transcript and slots handed over.
7. **Consent and recording.** An announcement at call start, explicit consent capture, and recordings
   in object storage — required before this could legally run at volume in India.

---

## Deployment

The two halves deploy separately, because **the voice server holds a WebSocket open for the length of
a call and serverless functions cannot**.

### 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech) and copy the pooled connection string.
2. `DATABASE_URL="postgresql://…" pnpm db:migrate && DATABASE_URL="postgresql://…" pnpm db:seed`

### 2. Voice server — Render

1. Push the repository to GitHub.
2. Render → **New → Blueprint** → select the repo. `render.yaml` is picked up automatically.
3. Set the `sync: false` variables in the dashboard: `DATABASE_URL`, `ALLOWED_ORIGINS` (your Vercel
   origin), `PUBLIC_BASE_URL` (the Render URL), and any provider keys. All are optional — with none
   set the service runs on mocks and still answers calls.
4. Use the **starter plan or above**. The free tier sleeps, which drops live calls.

Fly.io works equally well: `fly launch --dockerfile apps/voice/Dockerfile`, then `fly secrets set …`.

### 3. Web app — Vercel

1. Vercel → **New Project** → import the repo. `vercel.json` supplies the build command.
2. Set `DATABASE_URL`, `NEXT_PUBLIC_VOICE_WS_URL` (`wss://…onrender.com`),
   `NEXT_PUBLIC_VOICE_HTTP_URL` and `VOICE_SERVER_URL` (both `https://…onrender.com`), and
   `INTERNAL_API_TOKEN` matching the voice server.
3. Deploy, then add the Vercel origin to `ALLOWED_ORIGINS` on Render and redeploy that service.

### 4. Verify

```bash
curl https://<voice-host>/healthz     # active providers, persistence, KB, config version
```

Then open `https://<web-host>/demo` and place a call. The provider badges in the header tell you what
is live and what is mocked.

### Local, one command

```bash
pnpm setup   # install → docker postgres → migrate → seed → build
pnpm dev
```

---

## Verification status

At time of writing, on a clean checkout:

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test` | 108 tests pass |
| `pnpm eval` | 16 / 16 scenarios pass |
| `pnpm build` | pass |
| Prisma migration against Postgres 16 | applied |
| `pnpm db:seed` | 5 leads, 5 calls, 39 turns |
| `node apps/voice/scripts/smoke-call.mjs` | 11 / 11 checks pass over the live WebSocket |
