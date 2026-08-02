import type { AgentConfig } from '../../generated/client/index.js';
import { prisma, toJson } from '../client.js';

export interface AgentConfigInput {
  label: string;
  greetingHinglish: string;
  greetingHindi: string;
  greetingEnglish: string;
  persona: string;
  guardrails: string[];
  slotOrder: string[];
  kbOverrides?: unknown;
  createdBy?: string;
}

export async function getActiveAgentConfig(): Promise<AgentConfig | null> {
  return prisma.agentConfig.findFirst({ where: { isActive: true }, orderBy: { id: 'desc' } });
}

export async function listAgentConfigs(take = 25): Promise<AgentConfig[]> {
  return prisma.agentConfig.findMany({ orderBy: { id: 'desc' }, take });
}

export async function getAgentConfig(id: number): Promise<AgentConfig | null> {
  return prisma.agentConfig.findUnique({ where: { id } });
}

/**
 * Saving from /admin always appends a new version and flips the active flag in
 * one transaction. Nothing is ever mutated in place, so a bad edit made live
 * during a demo can be rolled back by activating the previous version.
 */
export async function createAgentConfigVersion(input: AgentConfigInput): Promise<AgentConfig> {
  return prisma.$transaction(async (tx) => {
    await tx.agentConfig.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.agentConfig.create({
      data: {
        label: input.label,
        greetingHinglish: input.greetingHinglish,
        greetingHindi: input.greetingHindi,
        greetingEnglish: input.greetingEnglish,
        persona: input.persona,
        guardrails: input.guardrails,
        slotOrder: input.slotOrder,
        kbOverrides: input.kbOverrides == null ? undefined : toJson(input.kbOverrides),
        createdBy: input.createdBy ?? 'admin',
        isActive: true,
      },
    });
  });
}

export async function activateAgentConfig(id: number): Promise<AgentConfig> {
  return prisma.$transaction(async (tx) => {
    await tx.agentConfig.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.agentConfig.update({ where: { id }, data: { isActive: true } });
  });
}
