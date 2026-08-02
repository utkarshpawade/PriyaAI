import { describe, expect, it } from 'vitest';
import { amountToWords, digitsToWords, numberToWords, wordToNumber } from '../src/language/number-words.js';
import { normalizeForTTS } from '../src/language/normalize-tts.js';
import { PHRASEBOOK, acknowledgement } from '../src/language/phrasebook.js';

describe('numberToWords', () => {
  it('handles the irregular Hindi cardinals', () => {
    expect(numberToWords(85, 'hi-en')).toBe('pachaasi');
    expect(numberToWords(85, 'hi')).toBe('पचासी');
    expect(numberToWords(85, 'en')).toBe('eighty-five');
    expect(numberToWords(19, 'hi-en')).toBe('unnees');
    expect(numberToWords(90, 'hi')).toBe('नब्बे');
  });

  it('round-trips through the reverse lookup', () => {
    for (const value of [1, 7, 19, 40, 55, 75, 85, 99]) {
      expect(wordToNumber(numberToWords(value, 'hi-en'))).toBe(value);
      expect(wordToNumber(numberToWords(value, 'hi'))).toBe(value);
      expect(wordToNumber(numberToWords(value, 'en'))).toBe(value);
    }
  });
});

describe('amountToWords', () => {
  it('speaks lakhs and crores the Indian way', () => {
    expect(amountToWords(8_500_000, 'hi-en')).toBe('pachaasi lakh rupees');
    expect(amountToWords(8_500_000, 'en')).toBe('eighty-five lakh rupees');
    expect(amountToWords(8_500_000, 'hi')).toBe('पचासी लाख रुपये');
  });

  it('keeps the decimal on a fractional crore', () => {
    expect(amountToWords(12_000_000, 'hi-en')).toBe('ek point two crore rupees');
    expect(amountToWords(15_000_000, 'en')).toBe('one point five crore rupees');
    expect(amountToWords(20_000_000, 'hi-en')).toBe('do crore rupees');
  });

  it('reads digits individually for phone numbers', () => {
    expect(digitsToWords('98765', 'en')).toBe('nine eight seven six five');
    expect(digitsToWords('98765', 'hi-en')).toBe('nau aath saat chhah paanch');
  });
});

describe('normalizeForTTS', () => {
  it('expands rupee figures', () => {
    expect(normalizeForTTS('Price ₹85,00,000 hai', 'hi-en')).toContain('pachaasi lakh rupees');
    expect(normalizeForTTS('It is 1.2 Cr', 'hi-en')).toContain('ek point two crore rupees');
    expect(normalizeForTTS('Around ₹72 lakh', 'en')).toContain('seventy-two lakh rupees');
  });

  it('spells BHK so no engine tries to pronounce it as a word', () => {
    expect(normalizeForTTS('2BHK available hai', 'hi-en')).toContain('two B-H-K');
    expect(normalizeForTTS('3 BHK', 'en')).toContain('three B-H-K');
    expect(normalizeForTTS('4BHK+ hai', 'en')).toContain('four B-H-K plus');
    expect(normalizeForTTS('2 BHK', 'hi')).toContain('दो B-H-K');
  });

  it('expands areas, percentages and abbreviations', () => {
    expect(normalizeForTTS('715 sq ft carpet', 'en')).toContain('715 square feet');
    expect(normalizeForTTS('38% complete', 'en')).toContain('thirty-eight percent');
    expect(normalizeForTTS('EMI aur NOC', 'hi-en')).toContain('E-M-I');
    expect(normalizeForTTS('Q4 2027 possession', 'en')).toContain('quarter 4 of 2027');
  });

  it('leaves English loanwords in Latin script for Hindi output', () => {
    const spoken = normalizeForTTS('possession December 2027 mein hai, budget check karein', 'hi');
    expect(spoken).toContain('possession');
    expect(spoken).toContain('budget');
  });

  it('transliterates stray romanised Hindi when the target is Devanagari', () => {
    expect(normalizeForTTS('Namaste, theek hai', 'hi')).toContain('नमस्ते');
  });

  it('strips markdown and emoji that would be read aloud', () => {
    const spoken = normalizeForTTS('**Great** news 🎉 — see [details](http://x.com)', 'en');
    expect(spoken).not.toContain('*');
    expect(spoken).not.toContain('🎉');
    expect(spoken).not.toContain('http');
    expect(spoken).toContain('details');
  });

  it('does not split a decimal into two sentences', () => {
    expect(normalizeForTTS('Carpet 1.2 times bigger', 'en')).not.toContain('. 2');
  });
});

describe('phrasebook', () => {
  it('covers every register with the same key set', () => {
    const hindiKeys = Object.keys(PHRASEBOOK.hi.slotQuestions).sort();
    expect(Object.keys(PHRASEBOOK['hi-en'].slotQuestions).sort()).toEqual(hindiKeys);
    expect(Object.keys(PHRASEBOOK.en.slotQuestions).sort()).toEqual(hindiKeys);
  });

  it('rotates acknowledgements deterministically', () => {
    expect(acknowledgement('hi-en', 0)).toBe(acknowledgement('hi-en', 0));
    expect(acknowledgement('hi-en', 0)).not.toBe(acknowledgement('hi-en', 1));
  });

  it('writes Hindi phrases in Devanagari and Hinglish phrases in Latin', () => {
    expect(PHRASEBOOK.hi.greeting).toMatch(/[ऀ-ॿ]/);
    expect(PHRASEBOOK['hi-en'].greeting).not.toMatch(/[ऀ-ॿ]/);
    expect(PHRASEBOOK.en.greeting).not.toMatch(/[ऀ-ॿ]/);
  });
});
