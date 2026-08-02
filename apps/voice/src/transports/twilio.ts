import type { AgentEvent } from '@rvagent/agent';
import {
  AGENT_SAMPLE_RATE,
  StreamingResampler,
  TWILIO_SAMPLE_RATE,
  VAD_ENERGY_THRESHOLD,
  VAD_SPEECH_FRAMES,
  languageModeSchema,
  muLawDecode,
  muLawEncode,
  rmsEnergy,
  type LanguageMode,
} from '@rvagent/shared';
import { z } from 'zod';
import type { WebSocket } from 'ws';
import { startCall, type ActiveCall } from '../call-session.js';
import { logger } from '../logger.js';

/**
 * Twilio Media Streams transport.
 *
 * The same agent core as the browser, with two edges bolted on: G.711 mu-law
 * at 8 kHz becomes linear PCM16 at 24 kHz on the way in and back again on the
 * way out, and barge-in additionally sends Twilio a `clear` message so the
 * frames already queued in *their* buffer are dropped too. Without the `clear`,
 * the caller keeps hearing the agent for a second after interrupting.
 *
 * Message shapes verified against Twilio's Media Streams WebSocket reference.
 */

const twilioMessageSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('connected') }),
  z.object({
    event: z.literal('start'),
    start: z.object({
      streamSid: z.string(),
      callSid: z.string(),
      customParameters: z.record(z.string()).optional(),
    }),
  }),
  z.object({
    event: z.literal('media'),
    media: z.object({ payload: z.string(), track: z.string().optional() }),
  }),
  z.object({ event: z.literal('stop') }),
  z.object({ event: z.literal('mark'), mark: z.object({ name: z.string() }) }),
  z.object({ event: z.literal('dtmf'), dtmf: z.object({ digit: z.string() }) }),
]);

export interface TwilioSocketContext {
  fromNumber?: string;
  toNumber?: string;
  direction: 'inbound' | 'outbound';
}

export function handleTwilioSocket(socket: WebSocket, context: TwilioSocketContext): void {
  const inbound = new StreamingResampler(TWILIO_SAMPLE_RATE, AGENT_SAMPLE_RATE);
  const outbound = new StreamingResampler(AGENT_SAMPLE_RATE, TWILIO_SAMPLE_RATE);

  let call: ActiveCall | null = null;
  let streamSid: string | null = null;
  let voicedFrames = 0;
  let userSpeaking = false;

  const sendJson = (payload: unknown): void => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  };

  const onAgentEvent = (event: AgentEvent): void => {
    if (!streamSid) return;

    switch (event.type) {
      case 'audio': {
        const downsampled = outbound.process(event.frame);
        if (downsampled.length === 0) return;
        sendJson({
          event: 'media',
          streamSid,
          media: { payload: Buffer.from(muLawEncode(downsampled)).toString('base64') },
        });
        break;
      }
      case 'audio_end':
        sendJson({ event: 'mark', streamSid, mark: { name: `turn-${event.turnId}` } });
        break;
      case 'interrupt':
        // Drop whatever Twilio has already buffered for playback.
        outbound.reset();
        sendJson({ event: 'clear', streamSid });
        break;
      case 'ended':
        sendJson({ event: 'clear', streamSid });
        socket.close();
        break;
      case 'error':
        logger.warn({ code: event.code, message: event.message }, 'twilio call error');
        break;
      default:
        break;
    }
  };

  socket.on('message', (raw: Buffer) => {
    const parsed = twilioMessageSchema.safeParse(safeJson(raw.toString('utf8')));
    if (!parsed.success) return;
    void handleMessage(parsed.data);
  });

  socket.on('close', () => {
    void call?.finish();
    call = null;
  });

  socket.on('error', (error) => logger.warn({ err: error }, 'twilio socket error'));

  async function handleMessage(message: z.infer<typeof twilioMessageSchema>): Promise<void> {
    switch (message.event) {
      case 'start': {
        streamSid = message.start.streamSid;
        const languageMode = resolveLanguageMode(message.start.customParameters?.languageMode);

        call = await startCall({
          transport: 'phone',
          direction: context.direction,
          languageMode,
          fromNumber: context.fromNumber,
          toNumber: context.toNumber,
          twilioCallSid: message.start.callSid,
          onEvent: onAgentEvent,
        });
        logger.info({ callId: call.callId, streamSid }, 'twilio stream started');
        await call.session.start();
        break;
      }

      case 'media': {
        if (!call) return;
        const muLaw = new Uint8Array(Buffer.from(message.media.payload, 'base64'));
        const linear8k = muLawDecode(muLaw);
        detectSpeech(linear8k);
        const linear24k = inbound.process(linear8k);
        if (linear24k.length > 0) call.session.pushAudio(linear24k);
        break;
      }

      case 'stop': {
        const active = call;
        call = null;
        await active?.finish();
        break;
      }

      case 'dtmf':
      case 'mark':
      case 'connected':
        break;
    }
  }

  /** Energy VAD on the 8 kHz stream — the barge-in trigger for the phone path. */
  function detectSpeech(frame: Int16Array): void {
    const voiced = rmsEnergy(frame) >= VAD_ENERGY_THRESHOLD;

    if (!voiced) {
      voicedFrames = 0;
      if (userSpeaking) {
        userSpeaking = false;
        call?.session.setUserSpeaking(false);
      }
      return;
    }

    voicedFrames += 1;
    if (!userSpeaking && voicedFrames >= VAD_SPEECH_FRAMES) {
      userSpeaking = true;
      call?.session.setUserSpeaking(true);
    }
  }
}

function resolveLanguageMode(value: string | undefined): LanguageMode {
  const parsed = languageModeSchema.safeParse(value);
  return parsed.success ? parsed.data : 'auto';
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
