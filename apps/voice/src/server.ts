import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import { createApp } from './app.js';
import { agentConfigStore } from './agent-config-store.js';
import { initialiseProviders } from './call-session.js';
import { allowedOrigins, env, twilioEnabled } from './config.js';
import { persistenceStatus, probeDatabase } from './database.js';
import { logger } from './logger.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerInternalRoutes } from './routes/internal.js';
import { registerTwilioRoutes } from './routes/twilio.js';
import { handleBrowserSocket } from './transports/browser.js';

/**
 * The realtime voice server.
 *
 * This is a long-lived stateful process holding WebSockets, which is precisely
 * why it is deployed separately from the Next.js app: serverless functions
 * cannot hold a socket open for the length of a phone call.
 */
async function main(): Promise<void> {
  const app = createApp();

  await app.register(cors, {
    origin: (origin, callback) => {
      // Non-browser clients (Twilio, curl, health checks) send no Origin.
      if (!origin) return callback(null, true);
      const allowed = allowedOrigins();
      callback(null, allowed.includes('*') || allowed.includes(origin));
    },
  });
  await app.register(formbody); // Twilio webhooks are form-encoded.
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  await registerHealthRoutes(app);
  await registerInternalRoutes(app);
  await registerTwilioRoutes(app);

  app.get('/ws', { websocket: true }, (socket) => {
    handleBrowserSocket(socket);
  });

  app.get('/', async () => ({
    service: 'rvagent-voice',
    endpoints: ['/healthz', '/ws (browser audio)', '/twilio/incoming', '/twilio/stream'],
  }));

  const { notices } = initialiseProviders();
  await probeDatabase();
  await agentConfigStore.refresh();

  await app.listen({ port: env.PORT, host: env.HOST });

  logger.info(
    {
      port: env.PORT,
      persistence: persistenceStatus(),
      telephony: twilioEnabled ? 'configured' : 'not provisioned',
      downgrades: notices.length,
    },
    'voice server ready',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'voice server failed to start');
  process.exit(1);
});
