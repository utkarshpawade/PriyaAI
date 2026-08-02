import { describe, expect, it } from 'vitest';
import { detectLanguage, hasDevanagari, resolveReplyLanguage } from '../src/index.js';

describe('detectLanguage', () => {
  it('classifies Devanagari Hindi as hi', () => {
    expect(detectLanguage('मुझे तीन बीएचके फ्लैट चाहिए').language).toBe('hi');
    expect(detectLanguage('हाँ जी, बताइए').language).toBe('hi');
  });

  it('classifies Devanagari mixed with English words as hi-en', () => {
    expect(detectLanguage('मेरा budget around eighty lakh है').language).toBe('hi-en');
  });

  it('classifies romanised Hindi with English nouns as hi-en', () => {
    expect(detectLanguage('mujhe 3 BHK chahiye Wakad location mein').language).toBe('hi-en');
    expect(detectLanguage('haan bhai budget thoda kam hai but possession jaldi chahiye').language).toBe(
      'hi-en',
    );
  });

  it('classifies plain English as en', () => {
    expect(detectLanguage('I am looking for a three bedroom apartment').language).toBe('en');
    expect(detectLanguage('What is the possession timeline for this project?').language).toBe('en');
  });

  it('falls back to the previous turn language for content-free one-word answers', () => {
    expect(detectLanguage('3BHK', 'hi-en').language).toBe('hi-en');
    expect(detectLanguage('Wakad', 'en').language).toBe('en');
    expect(detectLanguage('okay', 'hi').language).toBe('hi');
  });

  it('reports low confidence when there is nothing to go on', () => {
    expect(detectLanguage('', 'en').confidence).toBe(0);
    expect(detectLanguage('3BHK', 'en').confidence).toBeLessThan(0.5);
  });

  it('detects Devanagari presence', () => {
    expect(hasDevanagari('possession कब है')).toBe(true);
    expect(hasDevanagari('possession kab hai')).toBe(false);
  });
});

describe('resolveReplyLanguage', () => {
  it('mirrors the caller in auto mode', () => {
    expect(resolveReplyLanguage('auto', 'hi')).toBe('hi');
    expect(resolveReplyLanguage('auto', 'en')).toBe('en');
  });

  it('lets an explicit mode override detection', () => {
    expect(resolveReplyLanguage('hi', 'en')).toBe('hi');
    expect(resolveReplyLanguage('en', 'hi')).toBe('en');
  });
});
