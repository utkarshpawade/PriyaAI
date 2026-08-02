import type { FastifyRequest } from 'fastify';
import type { AppInstance } from '../app.js';
import { z } from 'zod';
import { agentConfigStore } from '../agent-config-store.js';
import { env, twilioEnabled } from '../config.js';
import { logger } from '../logger.js';
import { createOutboundCall } from '../twilio-api.js';

const outboundSchema = z.object({
  to: z.string().min(8).max(20),
  languageMode: z.enum(['hi', 'hi-en', 'en', 'auto']).default('auto'),
});

/**
 * Endpoints the Next.js app calls server-to-server. Guarded by a shared secret
 * when one is configured; left open otherwise so the local demo needs no setup.
 */
export async function registerInternalRoutes(app: AppInstance): Promise<void> {
  /**
   * Called by /admin after saving a new AgentConfig version. Reloading here
   * rather than polling is what makes a live edit take effect on the very next
   * call instead of after a restart.
   */
  app.post('/internal/reload-config', async (request, reply) => {
    if (!authorised(request)) return reply.code(401).send({ error: 'unauthorised' });

    const config = await agentConfigStore.refresh();
    logger.info({ version: config.version, label: config.label }, 'agent config reloaded on demand');

    return {
      reloaded: true,
      version: config.version,
      label: config.label,
      slotOrder: config.slotOrder,
      projects: config.projects.map((project) => project.slug),
    };
  });

  app.post('/internal/outbound-call', async (request, reply) => {
    if (!authorised(request)) return reply.code(401).send({ error: 'unauthorised' });

    if (!twilioEnabled || !env.PUBLIC_BASE_URL) {
      return reply.code(503).send({
        error: 'telephony_not_provisioned',
        message:
          'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER and PUBLIC_BASE_URL to place outbound calls. See docs/LIMITATIONS.md.',
      });
    }

    const parsed = outboundSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', detail: parsed.error.flatten() });
    }

    try {
      const answerUrl = new URL('/twilio/incoming', env.PUBLIC_BASE_URL);
      answerUrl.searchParams.set('languageMode', parsed.data.languageMode);

      const result = await createOutboundCall({
        accountSid: env.TWILIO_ACCOUNT_SID!,
        authToken: env.TWILIO_AUTH_TOKEN!,
        to: parsed.data.to,
        from: env.TWILIO_PHONE_NUMBER!,
        answerUrl: answerUrl.toString(),
        statusCallbackUrl: new URL('/twilio/status', env.PUBLIC_BASE_URL).toString(),
      });

      logger.info({ to: parsed.data.to, sid: result.sid }, 'outbound call placed');
      return { placed: true, ...result };
    } catch (error) {
      logger.error({ err: error }, 'outbound call failed');
      return reply.code(502).send({
        error: 'twilio_error',
        message: error instanceof Error ? error.message : 'Unknown Twilio error',
      });
    }
  });
}

function authorised(request: FastifyRequest): boolean {
  if (!env.INTERNAL_API_TOKEN) return true;
  const header = request.headers.authorization;
  return header === `Bearer ${env.INTERNAL_API_TOKEN}`;
}
