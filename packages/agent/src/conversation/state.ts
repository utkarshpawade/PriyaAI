import {
  completeness,
  emptyQualificationState,
  isSlotFilled,
  qualificationSlotsSchema,
  type QualificationSlots,
  type QualificationSlotsPatch,
  type QualificationState,
  type SlotQuestionKey,
} from '@rvagent/shared';

/**
 * The deterministic half of the hybrid conversation design.
 *
 * The LLM phrases everything, but it never decides *what* still needs asking —
 * this tracker does. That is what stops the classic failure modes: re-asking a
 * slot the caller already answered, looping on a slot they refused, or
 * wandering off the qualification path entirely.
 */

export const DEFAULT_SLOT_ORDER: readonly SlotQuestionKey[] = [
  'intent',
  'configuration',
  'location',
  'budget',
  'purpose',
  'timeline',
  'financing',
  'name',
  'phone',
];

export interface SlotChange {
  key: SlotQuestionKey;
  previous: unknown;
  next: unknown;
  /** True when the caller revised an answer they had already given. */
  isRevision: boolean;
}

export interface MergeResult {
  changes: SlotChange[];
  slots: QualificationSlots;
}

/**
 * How many times one slot may be asked before the agent gives up on it.
 *
 * Without this the state machine is technically correct and conversationally
 * awful: a caller who ignores "self use or investment?" gets asked it on every
 * single turn, because the slot never fills and therefore stays next. Two
 * attempts is what a human consultant does before moving on.
 */
const MAX_ASKS_PER_SLOT = 2;

export class QualificationTracker {
  private state: QualificationState;
  private order: SlotQuestionKey[];
  private readonly askCounts = new Map<SlotQuestionKey, number>();

  constructor(initial?: Partial<QualificationState>, slotOrder?: readonly SlotQuestionKey[]) {
    const base = emptyQualificationState();
    this.state = {
      slots: { ...base.slots, ...initial?.slots },
      declined: [...(initial?.declined ?? [])],
      lastAsked: initial?.lastAsked ?? null,
    };
    this.order = normaliseOrder(slotOrder);
  }

  get snapshot(): QualificationState {
    return {
      slots: { ...this.state.slots, objections: [...this.state.slots.objections] },
      declined: [...this.state.declined],
      lastAsked: this.state.lastAsked,
    };
  }

  get slots(): QualificationSlots {
    return this.snapshot.slots;
  }

  get slotOrder(): readonly SlotQuestionKey[] {
    return this.order;
  }

  /** Replaces the question order live, e.g. after an /admin edit mid-call. */
  setSlotOrder(slotOrder: readonly SlotQuestionKey[]): void {
    this.order = normaliseOrder(slotOrder);
  }

  /**
   * Applies a patch and reports what actually moved.
   *
   * Revisions are explicitly allowed and explicitly reported: "actually make it
   * 3 BHK and 1.5 crore" must overwrite two filled slots and be acknowledged,
   * not silently ignored because those slots were already set.
   */
  merge(patch: QualificationSlotsPatch): MergeResult {
    const parsed = qualificationSlotsSchema.partial().safeParse(patch);
    if (!parsed.success) return { changes: [], slots: this.slots };

    const changes: SlotChange[] = [];
    const before = this.state.slots;
    const next: QualificationSlots = { ...before };

    for (const [field, value] of Object.entries(parsed.data)) {
      if (value == null) continue;

      if (field === 'objections') {
        const additions = (value as string[]).filter((item) => !next.objections.includes(item));
        if (additions.length > 0) next.objections = [...next.objections, ...additions];
        continue;
      }

      const key = field as keyof QualificationSlots;
      if (before[key] === value) continue;

      const questionKey = toQuestionKey(key);
      const wasFilled = questionKey ? isSlotFilled(before, questionKey) : false;
      Object.assign(next, { [key]: value });

      if (questionKey) {
        changes.push({
          key: questionKey,
          previous: before[key],
          next: value,
          // Budget arrives as two fields; only report the pair once.
          isRevision: wasFilled && !changes.some((change) => change.key === questionKey),
        });
      }
    }

    // A revised answer un-declines the slot: the caller changed their mind.
    const revisedKeys = new Set(changes.map((change) => change.key));
    this.state = {
      slots: next,
      declined: this.state.declined.filter((key) => !revisedKeys.has(key)),
      lastAsked: this.state.lastAsked,
    };

    return { changes: dedupeByKey(changes), slots: this.slots };
  }

  /** Marks a slot as refused so it is never asked again. */
  decline(key: SlotQuestionKey): void {
    if (!this.state.declined.includes(key)) {
      this.state.declined = [...this.state.declined, key];
    }
  }

  /**
   * Records that the agent asked about `key`. Once a slot has been asked twice
   * and is still empty, it is treated as declined so the conversation advances.
   */
  markAsked(key: SlotQuestionKey | null): void {
    this.state.lastAsked = key;
    if (key === null) return;

    const asks = (this.askCounts.get(key) ?? 0) + 1;
    this.askCounts.set(key, asks);

    if (asks > MAX_ASKS_PER_SLOT && !isSlotFilled(this.state.slots, key)) {
      this.decline(key);
    }
  }

  /** How many times a slot has been asked. Exposed for the eval report. */
  askCount(key: SlotQuestionKey): number {
    return this.askCounts.get(key) ?? 0;
  }

  get lastAsked(): SlotQuestionKey | null {
    return this.state.lastAsked;
  }

  /** The next question to ask, or null when qualification is complete. */
  nextSlot(): SlotQuestionKey | null {
    return (
      this.order.find(
        (key) => !isSlotFilled(this.state.slots, key) && !this.state.declined.includes(key),
      ) ?? null
    );
  }

  /** Every slot still outstanding, used to brief the LLM on what is left. */
  remainingSlots(): SlotQuestionKey[] {
    return this.order.filter(
      (key) => !isSlotFilled(this.state.slots, key) && !this.state.declined.includes(key),
    );
  }

  filledSlots(): SlotQuestionKey[] {
    return this.order.filter((key) => isSlotFilled(this.state.slots, key));
  }

  get declined(): readonly SlotQuestionKey[] {
    return this.state.declined;
  }

  completeness(): number {
    return completeness(this.state);
  }

  isComplete(): boolean {
    return this.nextSlot() === null;
  }
}

/** Maps a storage field back to the question that fills it. */
function toQuestionKey(field: keyof QualificationSlots): SlotQuestionKey | null {
  if (field === 'budgetMin' || field === 'budgetMax') return 'budget';
  if (field === 'email' || field === 'propertyType' || field === 'objections') return null;
  return field as SlotQuestionKey;
}

function dedupeByKey(changes: SlotChange[]): SlotChange[] {
  const seen = new Set<SlotQuestionKey>();
  return changes.filter((change) => {
    if (seen.has(change.key)) return false;
    seen.add(change.key);
    return true;
  });
}

/** Drops unknown keys from an admin-supplied order and appends anything missing. */
function normaliseOrder(slotOrder?: readonly SlotQuestionKey[]): SlotQuestionKey[] {
  if (!slotOrder || slotOrder.length === 0) return [...DEFAULT_SLOT_ORDER];
  const valid = slotOrder.filter((key) => DEFAULT_SLOT_ORDER.includes(key));
  const missing = DEFAULT_SLOT_ORDER.filter((key) => !valid.includes(key));
  return [...valid, ...missing];
}
