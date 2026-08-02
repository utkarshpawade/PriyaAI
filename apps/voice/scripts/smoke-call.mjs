#!/usr/bin/env node
/**
 * End-to-end smoke test against a running voice server.
 *
 * Opens the browser WebSocket, drives a full text-mode conversation, and
 * asserts that the pipeline produced transcripts, filled slots, called tools and
 * ended the call. This is the check that the *wire protocol* works — the eval
 * harness exercises the orchestrator in-process, but only this proves the
 * server, the socket and the persistence layer are wired together.
 *
 * Usage: node scripts/smoke-call.mjs [ws://localhost:8787]
 */
import { WebSocket } from 'ws';

const url = `${process.argv[2] ?? 'ws://localhost:8787'}/ws`;

const TURNS = [
  'Haan bataiye',
  'Mujhe ghar kharidna hai, 2 BHK chahiye Hinjewadi mein',
  'Budget 75 lakh tak hai',
  'Possession kab tak milega?',
  'Actually 3 BHK dekh lijiye, budget 1.2 crore kar sakte hain',
  'Mera naam Rohit Sharma hai, number 9876543210',
];

const received = {
  callStarted: null,
  transcripts: [],
  toolCalls: [],
  requirements: null,
  latencies: [],
  ended: null,
  errors: [],
};

const socket = new WebSocket(url);
let turnIndex = 0;

// Generous: MockTTS streams at a real speaking pace on purpose, so a six-turn
// conversation genuinely takes about as long as a six-turn conversation.
const failAfter = setTimeout(() => {
  console.error('\nTimed out waiting for the conversation to complete.');
  finish();
}, 150_000);

socket.on('open', () => {
  socket.send(JSON.stringify({ type: 'start_call', languageMode: 'hi-en' }));
});

socket.on('message', (raw, isBinary) => {
  if (isBinary) return; // TTS audio; not asserted here.

  const message = JSON.parse(raw.toString('utf8'));

  switch (message.type) {
    case 'call_started':
      received.callStarted = message;
      console.log(`call ${message.callId}`);
      console.log(
        `providers: STT=${message.providers.stt.name}(${message.providers.stt.mode}) ` +
          `LLM=${message.providers.llm.name}(${message.providers.llm.mode}) ` +
          `TTS=${message.providers.tts.name}(${message.providers.tts.mode})`,
      );
      break;

    case 'transcript':
      if (!message.isFinal) break;
      received.transcripts.push(message);
      console.log(
        `  ${message.role === 'user' ? 'caller' : 'priya '} [${message.language}] ${truncate(message.text)}`,
      );
      // The agent has finished its turn; send the next caller line.
      if (message.role === 'assistant') sendNextTurn();
      break;

    case 'tool_result':
      received.toolCalls.push(message);
      console.log(`    → ${message.detail}`);
      break;

    case 'requirements':
      received.requirements = message;
      break;

    case 'latency':
      received.latencies.push(message);
      break;

    case 'call_ended':
      received.ended = message;
      finish();
      break;

    case 'error':
      received.errors.push(message);
      console.error(`  ! ${message.code}: ${message.message}`);
      break;

    default:
      break;
  }
});

socket.on('error', (error) => {
  console.error(`Could not connect to ${url}: ${error.message}`);
  console.error('Start the voice server first: pnpm --filter @rvagent/voice dev');
  process.exit(1);
});

socket.on('close', () => {
  if (!received.ended) finish();
});

function sendNextTurn() {
  if (turnIndex >= TURNS.length) {
    socket.send(JSON.stringify({ type: 'end_call' }));
    // The server replies with call_ended; this guards against a lost reply.
    setTimeout(finish, 3_000);
    return;
  }
  const text = TURNS[turnIndex];
  turnIndex += 1;
  setTimeout(() => socket.send(JSON.stringify({ type: 'user_text', text })), 60);
}

let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(failAfter);

  const slots = received.requirements?.slots ?? {};
  const toolNames = new Set(received.toolCalls.map((call) => call.name));

  const checks = [
    ['call started', received.callStarted !== null],
    ['assistant spoke', received.transcripts.some((turn) => turn.role === 'assistant')],
    ['caller turns transcribed', received.transcripts.filter((turn) => turn.role === 'user').length >= 3],
    ['slots published', received.requirements !== null],
    ['configuration captured', slots.configuration === '3BHK'],
    ['budget revised upward', slots.budgetMax === 12_000_000],
    ['contact captured', slots.phone === '9876543210'],
    ['update_requirements called', toolNames.has('update_requirements')],
    ['get_project_info called', toolNames.has('get_project_info')],
    ['latency reported', received.latencies.some((entry) => entry.totalMs !== null)],
    ['no protocol errors', received.errors.length === 0],
  ];

  console.log('');
  for (const [label, passed] of checks) {
    console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label}`);
  }

  const failures = checks.filter(([, passed]) => !passed);
  console.log('');
  console.log(
    failures.length === 0
      ? `SMOKE PASS — ${checks.length} checks, ${received.transcripts.length} turns`
      : `SMOKE FAIL — ${failures.length} of ${checks.length} checks failed`,
  );

  try {
    socket.close();
  } catch {
    // Already closing.
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

function truncate(text) {
  return text.length > 96 ? `${text.slice(0, 96)}…` : text;
}
