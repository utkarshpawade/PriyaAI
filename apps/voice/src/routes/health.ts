import type { AppInstance } from '../app.js';
import { agentConfigStore } from '../agent-config-store.js';
import { activeProviderSet } from '../call-session.js';
import { env, twilioEnabled } from '../config.js';
import { persistenceStatus } from '../database.js';

const startedAt = Date.now();

/**
 * `/healthz` doubles as the "what is real right now" endpoint. The landing page
 * and the demo header both read it, so nobody has to guess whether they are
 * watching a live model or a mock.
 */
export async function registerHealthRoutes(app: AppInstance): Promise<void> {
  app.get('/healthz', async () => {
    const config = agentConfigStore.get();
    return {
      status: 'ok',
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      environment: env.NODE_ENV,
      providers: activeProviderSet(),
      persistence: persistenceStatus(),
      telephony: twilioEnabled ? 'configured' : 'not_provisioned',
      agentConfig: { version: config.version, label: config.label },
      knowledgeBase: config.projects.map((project) => ({
        slug: project.slug,
        name: project.name,
        isFictional: project.IS_FICTIONAL,
      })),
    };
  });

  // Kubernetes-style split so a deploy can distinguish "booted" from "usable".
  app.get('/readyz', async () => ({ ready: true }));
}
