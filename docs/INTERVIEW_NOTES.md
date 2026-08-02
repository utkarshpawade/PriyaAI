# Interview notes

Likely questions with answers short enough to actually say out loud.

---

### Why this stack?

TypeScript end to end so the slot schema, the WebSocket protocol and the React panel share one zod
definition instead of three drifting copies. Fastify for the realtime server because it holds
sockets and Next cannot. Next.js for the dashboard because most of it is server components reading
Postgres directly. Prisma because lead → call → turn is genuinely relational and I wanted typed
queries without writing a mapper.

The interesting choice is not any of those — it is putting the agent in its own package with no
transport dependency. That is what made two transports cheap and the eval suite meaningful.

### Why cascading STT → LLM → TTS instead of a speech-to-speech model?

Speech-to-speech is lower latency and sounds better. I chose cascading for one reason that overrides
both: **there is nowhere to enforce grounding in a speech-to-speech model.** The hard requirement is
that no property fact is ever invented. Cascading gives me a text boundary where I can force a tool
call and run an output filter before anything reaches the speaker.

Secondary reasons: text turns are auditable and exportable, language mirroring is a text-level
decision, provider choices stay independent, and it is roughly a third of the cost.

If the brief were "sound as human as possible", I would flip.

### How does barge-in work?

Five steps.

1. The AudioWorklet runs an energy VAD with hysteresis — three voiced 20 ms frames to trigger
   (~60 ms), twelve silent frames to release. The asymmetry stops a mid-sentence pause reading as
   end-of-speech. Only edges cross the socket.
2. The client flushes its own playback immediately, without waiting for the server, including buffers
   scheduled in the future.
3. The server aborts the TTS fetch and then the LLM generation, both via `AbortController`. Audio
   first, so the caller stops hearing her within a frame.
4. The server sends `{type:"interrupt"}` to cover the case where it detected the interruption first.
5. **The assistant turn is truncated to what was actually spoken** and marked `[interrupted]`. The
   speech queue confirms each chunk *after* it emits it. Skip this and the model believes it said
   things the caller never heard, and the next turn references them.

On the phone path there is a sixth: Twilio buffers outbound audio on their side, so we send
`{event:"clear"}` or she keeps playing for about a second.

Also: `getUserMedia` runs with `echoCancellation: true`. Without it the agent's own voice returns
through the mic and triggers barge-in on every single turn.

### How would you cut latency further?

In order of payoff:

1. **Shorten the endpoint hold.** It is the largest single component — 100–600 ms of deliberate
   waiting. Make it adaptive: shrink when the caller is speaking fluently, grow when they hesitate.
2. **Prompt caching.** The system prompt is the largest constant input; Gemini and Anthropic both
   cache it.
3. **Speculative TTS** on the first clause rather than waiting for sentence completion.
4. **Regional co-location** — Indian callers, Mumbai/Singapore compute, LLM in the same continent.
5. **Pre-warmed STT sockets.** Connection setup is 100–200 ms that currently lands inside turn one.

I would not reach for a smaller model first. `llmFirstTokenMs` is already the smallest measured
component; the win is in the waiting, not the thinking.

### How would you handle 1000 concurrent calls?

Sessions hold no cross-call state, so the first answer is horizontal scaling behind a WebSocket-aware
load balancer. One instance handles roughly 40–60 concurrent calls before the audio event loop
matters.

But **the process is not what breaks first — provider rate limits are.** Each call holds one STT
socket, one LLM stream and one TTS stream. At 1000 concurrent you are negotiating quota with
Deepgram and Google before you are buying servers.

Then, in order: move turn writes off the hot path onto a queue (the in-memory buffer for the
summarizer already exists, so a dropped write costs a dashboard row, not the call); pool provider
connections; cache prompts; and add fleet-level backpressure — refuse new calls above a watermark
rather than degrading every call in flight.

### How do you stop hallucination?

Two independent mechanisms, because a prompt is a request, not an enforcement point.

**Grounding.** The prompt describes what *exists*; only `get_project_info` and `check_matching_units`
say what is *true*. The KB is zod-validated at import, so a malformed project cannot load. When a
lookup misses, the tool returns an explicit instruction to say so, and the question is written to a
follow-up queue you can see on the call detail page.

**Output filtering.** Every sentence passes `filterAgentOutput()` before TTS. Nine rules — some
rewrite ("assured returns" → "returns depend on market conditions"), some block the sentence outright
(predicting a price double, manufactured scarcity). It then *forces* framing: any figure gets
"indicative and subject to availability", any possession date gets "expected".

The subtle part: every rule uses a Unicode-aware word boundary. JavaScript's `\b` is ASCII-only, so a
`\b`-delimited guardrail silently never fires on Hindi — the language the agent speaks most. The eval
caught that; there are unit tests pinning it now.

### What is your cost per call?

About **₹4–6 for a five-minute call**, dominated by speech, not the model: STT ≈ ₹2, LLM ≈ ₹0.5–1 with
Gemini Flash, TTS ≈ ₹1.5–3 depending on provider.

The implication is that optimising the LLM is the wrong lever. If I needed to halve cost I would look
at TTS caching for the fixed parts of the script — greetings, the standard disclaimers, common
objection responses — which are identical across thousands of calls.

### What breaks first at scale?

Provider concurrency limits, as above. After that, in order I would expect them: Postgres connection
count if turn writes stay synchronous; the summarizer, because it is an extra LLM call fired at
exactly the moment a call ends and calls end in bursts; and the pooled `AudioContext` on the client
if a browser tab is left open for hours.

Not the Node event loop. Audio is 50 small buffers a second per call, which is unremarkable.

### How would you add a new language, say Marathi?

Four places, roughly two days:

1. Add `mr` to the `Language` zod enum in `packages/shared` — the type error then points at every
   place that needs a case.
2. Add a Marathi column to the phrasebook. This is the real work: hand-written sales phrasing, not
   translation.
3. Add the function-word set to the language classifier and a Marathi numeral table to
   `number-words.ts`.
4. Provider config: Deepgram does not currently cover Marathi, so STT would go to Sarvam, which does.
   Sarvam Bulbul covers Marathi TTS.

Then add three scenarios to `pnpm eval`. The architecture does not change, which is the point of
having the register be a parameter rather than a fork.

### Why not just use an off-the-shelf voice agent platform?

For a production deployment I might — Vapi, Retell and Bland all solve the transport plumbing. What
they do not give you is the part this assignment is actually testing: a domain-specific slot machine,
enforced grounding against your own inventory, compliance filtering in three languages, and a lead
record your sales team can work. Those are the parts I built; the plumbing is the part I would happily
replace.

### What would you do differently if you started again?

Write the eval harness first. I wrote it after the orchestrator and it immediately found two real
bugs — the Devanagari word-boundary failure and a budget parser that read "3 BHK … 1.5 crore" as a
three-crore range. Both had been sitting in code that looked correct and passed a casual manual test.

I would also have made `MockTTS` real-time from the start. My first version returned instantly, which
hid the fact that the jitter buffer and barge-in timing were never actually being exercised.

### What are you least happy with?

The language classifier. It is rule-based, which makes it fast and predictable and testable — but a
heavily transliterated sentence with no function words falls back to the previous turn's language
rather than genuinely classifying. It works because real callers use function words constantly, not
because the approach is right. A small on-device classifier is the correct answer and it is first on
the next-version list.

Second: the Sarvam STT adapter buffers per utterance because their REST endpoint is not streaming, so
it pays a round trip after end-of-speech that Deepgram does not. I kept it because Sarvam's Hinglish
accuracy is genuinely better, but the latency trade is real and I would want the streaming endpoint.

### How do I know any of this actually works?

`pnpm eval` — 16 scripted conversations through the real orchestrator, offline, asserting slots,
outcomes, tools called and guardrail compliance. `pnpm test` — 108 unit tests including the μ-law
codec against the G.711 error bound and budget parsing across Hindi, Hinglish and English.
`node apps/voice/scripts/smoke-call.mjs` — drives a full call over the live WebSocket protocol and
checks 11 properties end to end. All of it runs in CI on every push, with no API keys.
