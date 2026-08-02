import { describe, expect, it } from 'vitest';
import {
  completeness,
  emptyQualificationState,
  formatBudgetRange,
  formatInrCompact,
  formatInrFull,
  isSlotFilled,
  isWithinBudget,
  qualificationSlotsSchema,
} from '../src/index.js';

describe('qualification slots', () => {
  it('starts empty with an empty objections array', () => {
    const state = emptyQualificationState();
    expect(state.slots.objections).toEqual([]);
    expect(state.declined).toEqual([]);
    expect(completeness(state)).toBe(0);
  });

  it('treats budget as filled when either bound is known', () => {
    const state = emptyQualificationState();
    expect(isSlotFilled(state.slots, 'budget')).toBe(false);
    expect(isSlotFilled({ ...state.slots, budgetMax: 9_000_000 }, 'budget')).toBe(true);
    expect(isSlotFilled({ ...state.slots, budgetMin: 6_000_000 }, 'budget')).toBe(true);
  });

  it('counts declined slots towards completeness so the agent stops re-asking', () => {
    const state = emptyQualificationState();
    state.slots.intent = 'buy';
    state.declined = ['phone'];
    expect(completeness(state)).toBeCloseTo(2 / 7, 5);
  });

  it('rejects malformed slot payloads at the boundary', () => {
    expect(qualificationSlotsSchema.safeParse({ intent: 'lease', objections: [] }).success).toBe(
      false,
    );
    expect(qualificationSlotsSchema.safeParse({ budgetMin: -5, objections: [] }).success).toBe(false);
    expect(qualificationSlotsSchema.safeParse({ email: 'nope', objections: [] }).success).toBe(false);
  });
});

describe('money formatting', () => {
  it('formats lakhs and crores the Indian way', () => {
    expect(formatInrCompact(8_500_000)).toBe('₹85 L');
    expect(formatInrCompact(12_000_000)).toBe('₹1.2 Cr');
    expect(formatInrCompact(15_000_000)).toBe('₹1.5 Cr');
    expect(formatInrFull(8_500_000)).toBe('₹85,00,000');
  });

  it('formats one-sided budgets honestly', () => {
    expect(formatBudgetRange(null, 10_000_000)).toBe('up to ₹1 Cr');
    expect(formatBudgetRange(6_000_000, null)).toBe('₹60 L+');
    expect(formatBudgetRange(6_000_000, 7_500_000)).toBe('₹60 L – ₹75 L');
    expect(formatBudgetRange(null, null)).toBe('—');
  });

  it('treats a missing bound as open-ended', () => {
    expect(isWithinBudget(9_000_000, null, 10_000_000)).toBe(true);
    expect(isWithinBudget(11_000_000, null, 10_000_000)).toBe(false);
    expect(isWithinBudget(11_000_000, 5_000_000, null)).toBe(true);
  });
});
