import type { ProviderSet } from '@rvagent/shared';
import { AnthropicLlmProvider } from './llm/anthropic.js';
import { GeminiLlmProvider } from './llm/gemini.js';
import { GroqLlmProvider } from './llm/groq.js';
import { OpenAiLlmProvider } from './llm/openai.js';
import { ResilientLlmProvider } from './llm/resilient.js';
import { MockLlmProvider } from './mock/llm.js';
import { MockSttProvider } from './mock/stt.js';
import { BrowserSpeechTtsProvider, MockTtsProvider } from './mock/tts.js';
import { BrowserSpeechSttProvider } from './stt/browser.js';
import { DeepgramSttProvider } from './stt/deepgram.js';
import { SarvamSttProvider } from './stt/sarvam.js';
import { ElevenLabsTtsProvider } from './tts/elevenlabs.js';
import { SarvamTtsProvider } from './tts/sarvam.js';
import { describeProviders, type LlmProvider, type ProviderSetInstance } from './types.js';

/**
 * Provider selection.
 *
 * The rule is: an explicit `*_PROVIDER` env var wins, but if its key is missing
 * we downgrade to something that works rather than crashing on boot, and we say
 * so loudly. Nobody should ever discover a missing key by watching a demo fail
 * live — they should read it in the boot log and see it on the badge in the UI.
 */

export type SttProviderName = 'deepgram' | 'sarvam' | 'browser' | 'mock';
export type LlmProviderName = 'groq' | 'gemini' | 'openai' | 'anthropic' | 'mock';
export type TtsProviderName = 'sarvam' | 'elevenlabs' | 'browser' | 'mock';

export interface ProviderEnv {
  STT_PROVIDER?: string;
  LLM_PROVIDER?: string;
  TTS_PROVIDER?: string;
  DEEPGRAM_API_KEY?: string;
  DEEPGRAM_MODEL?: string;
  SARVAM_API_KEY?: string;
  SARVAM_STT_MODEL?: string;
  SARVAM_TTS_MODEL?: string;
  SARVAM_TTS_SPEAKER?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_MODEL_ID?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

export interface ProviderSelection {
  providers: ProviderSetInstance;
  describe: ProviderSet;
  /** Human-readable downgrade explanations, for the boot log and /healthz. */
  notices: string[];
}

export interface CreateProvidersOptions {
  /** Test hook: makes MockTTS emit instantly instead of at speaking pace. */
  realtimeMockAudio?: boolean;
}

export function createProviders(
  env: ProviderEnv = process.env as ProviderEnv,
  options: CreateProvidersOptions = {},
): ProviderSelection {
  const notices: string[] = [];

  const providers: ProviderSetInstance = {
    stt: createStt(env, notices),
    llm: createLlm(env, notices),
    tts: createTts(env, notices, options),
  };

  return { providers, describe: describeProviders(providers), notices };
}

function createStt(env: ProviderEnv, notices: string[]) {
  const requested = normalise(env.STT_PROVIDER) as SttProviderName | undefined;

  if (requested === 'mock') return new MockSttProvider();
  if (requested === 'browser') return new BrowserSpeechSttProvider();

  if (requested === 'deepgram' || (!requested && env.DEEPGRAM_API_KEY)) {
    if (env.DEEPGRAM_API_KEY) {
      return new DeepgramSttProvider({ apiKey: env.DEEPGRAM_API_KEY, model: env.DEEPGRAM_MODEL });
    }
    notices.push('STT_PROVIDER=deepgram but DEEPGRAM_API_KEY is missing.');
  }

  if (requested === 'sarvam' || (!requested && env.SARVAM_API_KEY)) {
    if (env.SARVAM_API_KEY) {
      return new SarvamSttProvider({ apiKey: env.SARVAM_API_KEY, model: env.SARVAM_STT_MODEL });
    }
    notices.push('STT_PROVIDER=sarvam but SARVAM_API_KEY is missing.');
  }

  // Zero-key default: the browser transcribes locally with the Web Speech API,
  // which keeps the primary demo fully functional with no credentials at all.
  notices.push('STT falling back to the browser Web Speech API (no STT key configured).');
  return new BrowserSpeechSttProvider();
}

function createLlm(env: ProviderEnv, notices: string[]) {
  const live = createLiveLlm(env, notices);
  if (!live) return new MockLlmProvider();

  // Any live model gets the offline responder as a safety net. Rate limits on
  // free tiers are routine, and a degraded reply beats silence mid-call.
  return new ResilientLlmProvider(live, new MockLlmProvider(), (error) => {
    console.warn(`[llm] ${live.info.name} failed, falling back to MockLLM: ${error.message}`);
  });
}

function createLiveLlm(env: ProviderEnv, notices: string[]): LlmProvider | null {
  const requested = normalise(env.LLM_PROVIDER) as LlmProviderName | undefined;

  if (requested === 'mock') return null;

  // Groq first: an OpenAI-compatible endpoint on LPU hardware, fast enough that
  // first-token time stops mattering in the latency budget.
  if (requested === 'groq' || (!requested && env.GROQ_API_KEY)) {
    if (env.GROQ_API_KEY) {
      return new GroqLlmProvider({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL });
    }
    notices.push('LLM_PROVIDER=groq but GROQ_API_KEY is missing.');
  }

  if (requested === 'gemini' || (!requested && env.GEMINI_API_KEY)) {
    if (env.GEMINI_API_KEY) {
      return new GeminiLlmProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
    }
    notices.push('LLM_PROVIDER=gemini but GEMINI_API_KEY is missing.');
  }

  if (requested === 'openai' || (!requested && env.OPENAI_API_KEY)) {
    if (env.OPENAI_API_KEY) {
      return new OpenAiLlmProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL });
    }
    notices.push('LLM_PROVIDER=openai but OPENAI_API_KEY is missing.');
  }

  if (requested === 'anthropic' || (!requested && env.ANTHROPIC_API_KEY)) {
    if (env.ANTHROPIC_API_KEY) {
      return new AnthropicLlmProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
    }
    notices.push('LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing.');
  }

  notices.push('LLM falling back to MockLLM (no LLM key configured) — the full flow still runs.');
  return null;
}

function createTts(env: ProviderEnv, notices: string[], options: CreateProvidersOptions) {
  const requested = normalise(env.TTS_PROVIDER) as TtsProviderName | undefined;

  if (requested === 'mock') {
    return new MockTtsProvider({ realtime: options.realtimeMockAudio ?? true });
  }
  if (requested === 'browser') return new BrowserSpeechTtsProvider();

  if (requested === 'sarvam' || (!requested && env.SARVAM_API_KEY)) {
    if (env.SARVAM_API_KEY) {
      return new SarvamTtsProvider({
        apiKey: env.SARVAM_API_KEY,
        model: env.SARVAM_TTS_MODEL,
        speaker: env.SARVAM_TTS_SPEAKER,
      });
    }
    notices.push('TTS_PROVIDER=sarvam but SARVAM_API_KEY is missing.');
  }

  if (requested === 'elevenlabs' || (!requested && env.ELEVENLABS_API_KEY)) {
    if (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID) {
      return new ElevenLabsTtsProvider({
        apiKey: env.ELEVENLABS_API_KEY,
        voiceId: env.ELEVENLABS_VOICE_ID,
        modelId: env.ELEVENLABS_MODEL_ID,
      });
    }
    notices.push('ElevenLabs needs both ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.');
  }

  notices.push('TTS falling back to browser speech synthesis (no TTS key configured).');
  return new BrowserSpeechTtsProvider();
}

function normalise(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/** One-line boot summary, e.g. `STT=Deepgram(live) LLM=MockLLM(mock) TTS=...`. */
export function formatProviderSummary(set: ProviderSet): string {
  return (['stt', 'llm', 'tts'] as const)
    .map((kind) => `${kind.toUpperCase()}=${set[kind].name}/${set[kind].model} (${set[kind].mode})`)
    .join('  ');
}
