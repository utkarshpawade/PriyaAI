import type { AgentEvent } from '@rvagent/agent';
import {
  AGENT_SAMPLE_RATE,
  LANGUAGE_BCP47,
  bufferToPcm16,
  encodeServerMessage,
  parseClientMessage,
  pcm16ToBuffer,
  type ServerMessage,
} from '@rvagent/shared';
import type { WebSocket } from 'ws';
import { startCall, type ActiveCall } from '../call-session.js';
import { logger } from '../logger.js';

/**
 * Browser transport.
 *
 * Binary frames are PCM16 at the agent's own sample rate in both directions, so
 * this adapter does no resampling at all — the AudioWorklet on the client
 * already delivers 24 kHz. All it does is translate `AgentEvent`s onto the wire
 * protocol and client messages back into session calls.
 */

/** Above this, the client is not draining audio and we stop adding to the queue. */
const MAX_BUFFERED_BYTES = 512 * 1024;

export function handleBrowserSocket(socket: WebSocket): void {
  let call: ActiveCall | null = null;
  let starting = false;

  const send = (message: ServerMessage): void => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(encodeServerMessage(message));
  };

  const sendAudio = (frame: Int16Array): void => {
    if (socket.readyState !== socket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
    socket.send(pcm16ToBuffer(frame));
  };

  const onAgentEvent = (event: AgentEvent): void => {
    switch (event.type) {
      case 'audio':
        sendAudio(event.frame);
        break;
      case 'audio_start':
        send({ type: 'audio_start', turnId: event.turnId, sampleRate: AGENT_SAMPLE_RATE });
        break;
      case 'audio_end':
        send({ type: 'audio_end', turnId: event.turnId });
        break;
      case 'speak_browser':
        send({
          type: 'speak_browser',
          turnId: event.turnId,
          text: event.text,
          lang: LANGUAGE_BCP47[event.language],
        });
        break;
      case 'state':
        send({ type: 'state', state: event.state });
        break;
      case 'transcript':
        send({
          type: 'transcript',
          turnId: event.turnId,
          role: event.role,
          text: event.text,
          language: event.language,
          isFinal: event.isFinal,
          interrupted: event.interrupted,
        });
        break;
      case 'agent_delta':
        send({ type: 'agent_delta', turnId: event.turnId, text: event.text });
        break;
      case 'interrupt':
        send({ type: 'interrupt' });
        break;
      case 'requirements':
        send({
          type: 'requirements',
          slots: event.slots,
          declined: [...event.declined],
          completeness: event.completeness,
          nextSlot: event.nextSlot,
        });
        break;
      case 'tool_call':
        send({ type: 'tool_call', id: event.id, name: event.name, args: event.args });
        break;
      case 'tool_result':
        send({
          type: 'tool_result',
          id: event.id,
          name: event.name,
          ok: event.ok,
          detail: event.detail,
        });
        break;
      case 'latency':
        send({
          type: 'latency',
          turnIndex: event.turnIndex,
          sttMs: event.sttMs,
          llmFirstTokenMs: event.llmFirstTokenMs,
          ttsFirstByteMs: event.ttsFirstByteMs,
          totalMs: event.totalMs,
        });
        break;
      case 'ended':
        send({
          type: 'call_ended',
          callId: call?.callId ?? '',
          outcome: event.outcome,
          summaryReady: true,
        });
        break;
      case 'error':
        send({ type: 'error', code: event.code, message: event.message });
        break;
    }
  };

  socket.on('message', (raw: Buffer, isBinary: boolean) => {
    if (isBinary) {
      call?.session.pushAudio(bufferToPcm16(raw));
      return;
    }
    void handleTextMessage(raw.toString('utf8'));
  });

  socket.on('close', () => {
    void call?.finish();
    call = null;
  });

  socket.on('error', (error) => {
    logger.warn({ err: error }, 'browser socket error');
  });

  async function handleTextMessage(raw: string): Promise<void> {
    const message = parseClientMessage(raw);
    if (!message) {
      send({ type: 'error', code: 'bad_message', message: 'Unrecognised message.' });
      return;
    }

    if (message.type === 'ping') {
      send({ type: 'pong' });
      return;
    }

    if (message.type === 'start_call') {
      if (call || starting) return;
      starting = true;
      try {
        call = await startCall({
          transport: 'web',
          direction: 'inbound',
          languageMode: message.languageMode,
          onEvent: onAgentEvent,
        });
        send({
          type: 'call_started',
          callId: call.callId,
          providers: call.providerSet,
          languageMode: message.languageMode,
          sampleRate: AGENT_SAMPLE_RATE,
        });
        await call.session.start();
      } catch (error) {
        logger.error({ err: error }, 'failed to start browser call');
        send({ type: 'error', code: 'start_failed', message: 'Could not start the call.' });
      } finally {
        starting = false;
      }
      return;
    }

    if (!call) {
      send({ type: 'error', code: 'no_call', message: 'Send start_call first.' });
      return;
    }

    switch (message.type) {
      case 'user_text':
        await call.session.pushText(message.text);
        break;
      case 'vad':
        call.session.setUserSpeaking(message.speaking);
        break;
      case 'set_language':
        call.session.setLanguageMode(message.languageMode);
        break;
      case 'mute':
        call.session.setMuted(message.muted);
        break;
      case 'end_call': {
        const active = call;
        call = null;
        await active.finish(active.session.telemetry().outcome === 'in_progress' ? 'abandoned' : undefined);
        break;
      }
    }
  }
}
