import type { FastifyRequest } from 'fastify';
import type { AppInstance } from '../app.js';
import { z } from 'zod';
import { env, twilioEnabled } from '../config.js';
import { logger } from '../logger.js';
import { handleTwilioSocket } from '../transports/twilio.js';
import { buildRejectTwiml, buildStreamTwiml, validateTwilioSignature } from '../twilio-api.js';

const incomingSchema = z.object({
  CallSid: z.string().optional(),
  From: z.string().optional(),
  To: z.string().optional(),
  Direction: z.string().optional(),
  languageMode: z.string().optional(),
});

export async function registerTwilioRoutes(app: AppInstance): Promise<void> {
  /**
   * Twilio fetches this when a call connects and we answer with TwiML that
   * opens a bidirectional media stream back to `/twilio/stream`.
   */
  app.post('/twilio/incoming', async (request, reply) => {
    const body = incomingSchema.safeParse(request.body ?? {});
    const params = (request.body ?? {}) as Record<string, string>;

    if (!verifySignature(request, params)) {
      logger.warn('rejected Twilio webhook with an invalid signature');
      return reply.code(403).type('text/xml').send(buildRejectTwiml('Request could not be verified.'));
    }

    const baseUrl = env.PUBLIC_BASE_URL ?? inferBaseUrl(request);
    const streamUrl = `${baseUrl.replace(/^http/, 'ws')}/twilio/stream`;
    const languageMode = body.success ? (body.data.languageMode ?? 'auto') : 'auto';

    logger.info(
      { callSid: body.success ? body.data.CallSid : undefined, streamUrl },
      'answering Twilio call with a media stream',
    );

    return reply.type('text/xml').send(buildStreamTwiml(streamUrl, languageMode));
  });

  /** Twilio's call status callbacks. Logged for the demo, not acted on. */
  app.post('/twilio/status', async (request, reply) => {
    logger.info({ status: request.body }, 'twilio call status');
    return reply.code(204).send();
  });

  app.get('/twilio/stream', { websocket: true }, (socket, request) => {
    if (!twilioEnabled) {
      logger.warn('twilio stream opened without Twilio credentials configured');
    }
    const query = request.query as Record<string, string | undefined>;
    handleTwilioSocket(socket, {
      direction: query.direction === 'outbound' ? 'outbound' : 'inbound',
      fromNumber: query.from,
      toNumber: query.to,
    });
  });
}

function verifySignature(request: FastifyRequest, params: Record<string, string>): boolean {
  if (!env.TWILIO_VALIDATE_SIGNATURE || !env.TWILIO_AUTH_TOKEN) return true;

  const baseUrl = env.PUBLIC_BASE_URL ?? inferBaseUrl(request);
  const url = `${baseUrl}${request.url}`;
  const signature = request.headers['x-twilio-signature'];

  return validateTwilioSignature(
    env.TWILIO_AUTH_TOKEN,
    typeof signature === 'string' ? signature : undefined,
    url,
    params,
  );
}

function inferBaseUrl(request: FastifyRequest): string {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : 'https';
  return `${protocol}://${request.headers.host ?? 'localhost'}`;
}
