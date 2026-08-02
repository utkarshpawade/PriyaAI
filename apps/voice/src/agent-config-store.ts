import { agentConfigFromRecord, defaultAgentConfig, type AgentRuntimeConfig } from '@rvagent/agent';
import { getActiveAgentConfig } from '@rvagent/db';
import { persistenceEnabled } from './config.js';
import { logger } from './logger.js';

/**
 * Holds the live agent configuration and swaps it atomically.
 *
 * This is what makes "modify the conversation flow on the spot" work without a
 * redeploy: /admin writes a new AgentConfig row, pings `/internal/reload`, and
 * the next call picks up the new persona, greeting, guardrails, slot order and
 * knowledge-base overrides. A call already in progress keeps the config it
 * started with, because swapping mid-sentence would produce a visibly
 * inconsistent agent.
 */
export class AgentConfigStore {
  private current: AgentRuntimeConfig = defaultAgentConfig();

  get(): AgentRuntimeConfig {
    return this.current;
  }

  async refresh(): Promise<AgentRuntimeConfig> {
    if (!persistenceEnabled) return this.current;

    try {
      const record = await getActiveAgentConfig();
      if (!record) {
        this.current = defaultAgentConfig();
        return this.current;
      }

      const next = agentConfigFromRecord(record);
      const changed = next.version !== this.current.version;
      this.current = next;
      if (changed) {
        logger.info({ version: next.version, label: next.label }, 'agent config loaded');
      }
      return next;
    } catch (error) {
      // A bad knowledge-base override must not take the agent down; keep serving
      // the last configuration that validated.
      logger.error(
        { err: error, keepingVersion: this.current.version },
        'failed to load agent config, keeping the previous version',
      );
      return this.current;
    }
  }
}

export const agentConfigStore = new AgentConfigStore();
