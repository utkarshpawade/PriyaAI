'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneCall, PhoneOff, Send } from 'lucide-react';
import {
  emptySlots,
  type AgentState,
  type LanguageMode,
  type ProviderSet,
  type QualificationSlots,
  type TurnLatency,
} from '@rvagent/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel';
import { browserSocketUrl } from '@/lib/env';
import { cn } from '@/lib/utils';
import { VoiceClient, type VoiceClientEvent } from '@/lib/voice-client';
import { LatencyReadout, ProviderBadges } from './latency-readout';
import { RequirementsPanel } from './requirements-panel';
import { ToolTrace, Transcript, type ToolTraceEntry, type TranscriptTurn } from './transcript';
import { Waveform } from './waveform';

const LANGUAGE_OPTIONS: Array<{ value: LanguageMode; label: string }> = [
  { value: 'auto', label: 'Auto — mirror the caller' },
  { value: 'hi-en', label: 'Force Hinglish' },
  { value: 'hi', label: 'Force Hindi' },
  { value: 'en', label: 'Force English' },
];

const STATE_LABEL: Record<AgentState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  ended: 'Call ended',
};

type CallPhase = 'idle' | 'connecting' | 'live' | 'ended';

export function DemoConsole() {
  const clientRef = useRef<VoiceClient | null>(null);
  const energyRef = useRef(0);

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('auto');
  const [providers, setProviders] = useState<ProviderSet | null>(null);
  const [callId, setCallId] = useState<string | null>(null);

  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [tools, setTools] = useState<ToolTraceEntry[]>([]);
  const [slots, setSlots] = useState<QualificationSlots>(() => emptySlots());
  const [declined, setDeclined] = useState<string[]>([]);
  const [completeness, setCompleteness] = useState(0);
  const [nextSlot, setNextSlot] = useState<string | null>(null);
  const [latency, setLatency] = useState<TurnLatency | null>(null);

  const [micGranted, setMicGranted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const upsertTurn = useCallback((turn: TranscriptTurn, append: boolean) => {
    setTurns((previous) => {
      const index = previous.findIndex((candidate) => candidate.id === turn.id);
      if (index === -1) return [...previous, turn];

      const next = [...previous];
      next[index] = append
        ? { ...next[index], ...turn, text: next[index].text + turn.text }
        : { ...next[index], ...turn };
      return next;
    });
  }, []);

  const handleEvent = useCallback(
    (event: VoiceClientEvent) => {
      if (event.type === 'level') {
        energyRef.current = event.energy;
        return;
      }

      if (event.type === 'mic') {
        setMicGranted(event.state === 'granted');
        if (event.state !== 'granted') {
          setNotice('Microphone unavailable — text mode is ready below.');
        }
        return;
      }

      if (event.type === 'notice') {
        setNotice(event.message);
        return;
      }

      if (event.type === 'connection') {
        if (event.state === 'error') setNotice('Could not reach the voice server on port 8787.');
        if (event.state === 'closed' && phase === 'live') setPhase('ended');
        return;
      }

      const message = event.message;
      switch (message.type) {
        case 'call_started':
          setCallId(message.callId);
          setProviders(message.providers);
          setPhase('live');
          break;

        case 'state':
          setAgentState(message.state);
          break;

        case 'transcript':
          upsertTurn(
            {
              id: message.turnId,
              role: message.role,
              text: message.text,
              language: message.language,
              isFinal: message.isFinal,
              interrupted: message.interrupted,
            },
            false,
          );
          break;

        case 'agent_delta':
          upsertTurn(
            {
              id: message.turnId,
              role: 'assistant',
              text: message.text,
              language: 'hi-en',
              isFinal: false,
              interrupted: false,
            },
            true,
          );
          break;

        case 'requirements':
          setSlots(message.slots);
          setDeclined([...message.declined]);
          setCompleteness(message.completeness);
          setNextSlot(message.nextSlot);
          break;

        case 'tool_result':
          setTools((previous) => [
            ...previous,
            { id: message.id, name: message.name, detail: message.detail, ok: message.ok },
          ]);
          break;

        case 'latency':
          setLatency({
            sttMs: message.sttMs,
            llmFirstTokenMs: message.llmFirstTokenMs,
            ttsFirstByteMs: message.ttsFirstByteMs,
            totalMs: message.totalMs,
          });
          break;

        case 'call_ended':
          setPhase('ended');
          setAgentState('ended');
          break;

        case 'error':
          setNotice(message.message);
          break;

        default:
          break;
      }
    },
    [phase, upsertTurn],
  );

  // The handler closes over `phase`; keeping it in a ref lets the client hold a
  // single stable callback for the life of the socket.
  const handlerRef = useRef(handleEvent);
  useEffect(() => {
    handlerRef.current = handleEvent;
  }, [handleEvent]);

  const startCall = useCallback(async () => {
    setPhase('connecting');
    setNotice(null);
    setTurns([]);
    setTools([]);
    setSlots(emptySlots());
    setDeclined([]);
    setCompleteness(0);
    setNextSlot(null);
    setLatency(null);

    const client = new VoiceClient({
      url: browserSocketUrl(),
      onEvent: (event) => handlerRef.current(event),
    });
    clientRef.current = client;

    try {
      await client.connect();
      // Must happen inside the click handler's task for autoplay policies.
      await client.primeAudio();
      await client.enableMicrophone();
      client.startCall(languageMode);
    } catch {
      setPhase('idle');
      setNotice(
        'Could not reach the voice server. Run `pnpm dev` and check that port 8787 is up, then try again.',
      );
    }
  }, [languageMode]);

  const endCall = useCallback(() => {
    clientRef.current?.endCall();
    clientRef.current?.cancelBrowserSpeech();
    setPhase('ended');
    setAgentState('ended');
    window.setTimeout(() => clientRef.current?.disconnect(), 400);
  }, []);

  useEffect(() => () => clientRef.current?.disconnect(), []);

  const sendText = useCallback(() => {
    const text = textInput.trim();
    if (text.length === 0 || phase !== 'live') return;
    clientRef.current?.sendText(text);
    setTextInput('');
  }, [phase, textInput]);

  const changeLanguage = useCallback((mode: LanguageMode) => {
    setLanguageMode(mode);
    clientRef.current?.setLanguage(mode);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      clientRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const isLive = phase === 'live';
  const stateTone = useMemo(() => {
    if (agentState === 'speaking') return 'accent' as const;
    if (agentState === 'listening') return 'positive' as const;
    if (agentState === 'thinking') return 'warm' as const;
    return 'neutral' as const;
  }, [agentState]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Panel className="lit overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <Badge tone={stateTone}>{STATE_LABEL[agentState]}</Badge>
              {callId ? (
                <span className="font-mono text-[11px] text-ink-faint">call {callId.slice(0, 8)}</span>
              ) : null}
            </div>
            <ProviderBadges providers={providers} />
          </div>

          <div className="flex flex-col items-center gap-5 px-5 py-8">
            <button
              type="button"
              onClick={isLive ? endCall : startCall}
              disabled={phase === 'connecting'}
              className={cn(
                'grid h-20 w-20 place-items-center rounded-full transition-all disabled:opacity-60',
                isLive
                  ? 'bg-negative/20 text-negative ring-1 ring-negative/50 hover:bg-negative/30'
                  : 'animate-pulse-ring bg-accent text-canvas hover:bg-accent-strong',
              )}
              aria-label={isLive ? 'Hang up' : 'Start call'}
            >
              {isLive ? <PhoneOff className="h-7 w-7" /> : <PhoneCall className="h-7 w-7" />}
            </button>

            <p className="text-sm text-ink-muted">
              {phase === 'connecting'
                ? 'Connecting…'
                : isLive
                  ? 'Speak naturally — interrupt her any time'
                  : phase === 'ended'
                    ? 'Call ended. The summary is on the lead page.'
                    : 'Click to start a live call'}
            </p>

            <Waveform energyRef={energyRef} active={isLive && !muted} className="h-14 w-full max-w-md" />

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Select
                value={languageMode}
                onChange={(event) => changeLanguage(event.target.value as LanguageMode)}
                className="h-9 w-auto py-0 text-xs"
                aria-label="Language mode"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Button
                variant="secondary"
                size="sm"
                onClick={toggleMute}
                disabled={!isLive || !micGranted}
              >
                {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {muted ? 'Unmute' : 'Mute'}
              </Button>

              {isLive && !micGranted ? <Badge tone="mock">text mode</Badge> : null}
            </div>

            {notice ? (
              <p className="max-w-md text-center text-xs text-warm" role="status">
                {notice}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Transcript"
            description="Every turn is tagged with the language it was detected in."
          />
          <PanelBody className="max-h-[26rem] overflow-y-auto">
            <Transcript turns={turns} />
          </PanelBody>
          <div className="border-t border-line px-5 py-3">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                sendText();
              }}
            >
              <Input
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                placeholder={
                  isLive ? 'Type instead of speaking…' : 'Start the call to type or speak'
                }
                disabled={!isLive}
                aria-label="Type a message to the agent"
              />
              <Button type="submit" disabled={!isLive || textInput.trim().length === 0} size="md">
                <Send className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Send</span>
              </Button>
            </form>
            <p className="mt-2 text-[11px] text-ink-faint">
              Text mode drives the same orchestrator — useful when the room is noisy or the
              microphone is blocked.
            </p>
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel>
          <PanelHeader title="Requirements captured" description="Updates live as slots are filled." />
          <PanelBody>
            <RequirementsPanel
              slots={slots}
              declined={declined}
              completeness={completeness}
              nextSlot={nextSlot}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Turn latency" />
          <PanelBody>
            <LatencyReadout latency={latency} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Tool trace" description="Grounded lookups and writes." />
          <PanelBody>
            <ToolTrace entries={tools} />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
