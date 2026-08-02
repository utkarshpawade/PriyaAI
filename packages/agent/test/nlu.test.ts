import { describe, expect, it } from 'vitest';
import {
  detectObjection,
  detectSituations,
  parseBudget,
  parseConfiguration,
  parseFinancing,
  parseIntent,
  parseLocation,
  parseName,
  parsePhone,
  parseTimeline,
  parseVisitDateTime,
} from '../src/nlu/index.js';

const LOCALITIES = ['Hinjewadi Phase 2', 'Pune', 'Kharadi', 'hinjewadi', 'wakad'];

describe('parseBudget', () => {
  it('parses a spoken range', () => {
    expect(parseBudget('50 lakh se 60 lakh ke beech budget hai')).toMatchObject({
      budgetMin: 5_000_000,
      budgetMax: 6_000_000,
      kind: 'range',
    });
  });

  it('borrows the unit from the second figure when the first omits it', () => {
    expect(parseBudget('budget 50 se 60 lakh')).toMatchObject({
      budgetMin: 5_000_000,
      budgetMax: 6_000_000,
    });
  });

  it('treats "tak" and "up to" as a ceiling', () => {
    expect(parseBudget('1cr tak hai')).toMatchObject({ budgetMax: 10_000_000, kind: 'ceiling' });
    expect(parseBudget('budget up to 85 lakh')).toMatchObject({ budgetMax: 8_500_000 });
    expect(parseBudget('बजट एक करोड़ तक है')).toMatchObject({ budgetMax: 10_000_000 });
  });

  it('widens an approximate figure in both directions', () => {
    expect(parseBudget('around 80 lakh')).toMatchObject({
      budgetMin: 7_200_000,
      budgetMax: 8_800_000,
      kind: 'approximate',
    });
  });

  it('parses spoken numerals in Hindi and English', () => {
    expect(parseBudget('eighty five lakh ka budget')).toMatchObject({ budgetMax: 8_500_000 });
    expect(parseBudget('pachaasi lakh')).toMatchObject({ budgetMax: 8_500_000 });
    expect(parseBudget('do crore tak')).toMatchObject({ budgetMax: 20_000_000 });
    expect(parseBudget('पचास लाख')).toMatchObject({ budgetMax: 5_000_000 });
  });

  it('parses grouped rupee figures', () => {
    expect(parseBudget('₹85,00,000 ka budget hai')).toMatchObject({ budgetMax: 8_500_000 });
  });

  it('infers the unit an Indian buyer would have meant', () => {
    expect(parseBudget('budget 80 hai')).toMatchObject({ budgetMax: 8_000_000 });
    expect(parseBudget('budget 1.5 hai')).toMatchObject({ budgetMax: 15_000_000 });
  });

  it('ignores quantities that are not money', () => {
    expect(parseBudget('mujhe 3 BHK chahiye')).toBeNull();
    expect(parseBudget('1200 sq ft chahiye')).toBeNull();
  });

  it('does not fuse an unrelated figure into a range', () => {
    // The classic failure: "3 BHK ... 1.5 crore" read as a 3-crore-to-1.5-crore range.
    expect(parseBudget('Actually 3 BHK dekh lijiye, aur budget 1.5 crore kar sakte hain')).toMatchObject(
      { budgetMax: 15_000_000 },
    );
  });

  it('does not read the English verb "do" as the Hindi numeral two', () => {
    expect(parseBudget('I do have a budget of 80 lakh')).toMatchObject({ budgetMax: 8_000_000 });
  });
});

describe('parsePhone', () => {
  it('accepts the common written forms', () => {
    expect(parsePhone('mera number 9876543210 hai')?.phone).toBe('9876543210');
    expect(parsePhone('+91 98765-43210')?.phone).toBe('9876543210');
    expect(parsePhone('098765 43210')?.phone).toBe('9876543210');
  });

  it('rebuilds a number dictated digit by digit', () => {
    expect(parsePhone('nau aath saat chhah paanch chaar teen do ek shunya')?.phone).toBe(
      '9876543210',
    );
    expect(parsePhone('nine eight seven six five four three two one zero')?.phone).toBe(
      '9876543210',
    );
  });

  it('reads Devanagari digits', () => {
    expect(parsePhone('मेरा नंबर ९८७६५४३२१० है')?.phone).toBe('9876543210');
  });

  it('rejects numbers outside the Indian mobile series', () => {
    expect(parsePhone('1234567890')).toBeNull();
    expect(parsePhone('98765')).toBeNull();
  });

  it('does not mistake a budget for a phone number', () => {
    expect(parsePhone('budget do crore hai')).toBeNull();
  });
});

describe('slot parsers', () => {
  it('parses configuration in three registers', () => {
    expect(parseConfiguration('mujhe 2 BHK chahiye')).toBe('2BHK');
    expect(parseConfiguration('do bhk dekhna hai')).toBe('2BHK');
    expect(parseConfiguration('तीन बीएचके चाहिए')).toBe('3BHK');
    expect(parseConfiguration('a three bedroom flat')).toBe('3BHK');
    expect(parseConfiguration('penthouse dikhaiye')).toBe('4BHK+');
    expect(parseConfiguration('plot chahiye')).toBe('plot');
  });

  it('parses intent including Devanagari verbs', () => {
    expect(parseIntent('मुझे घर खरीदना है')).toBe('buy');
    expect(parseIntent('I want to buy a flat')).toBe('buy');
    expect(parseIntent('investment ke liye dekh raha hoon')).toBe('invest');
    expect(parseIntent('abhi sirf dekh raha hoon')).toBe('just_looking');
  });

  it('parses timeline and financing', () => {
    expect(parseTimeline('teen mahine mein finalise karna hai')).toBe('3_months');
    expect(parseTimeline('turant chahiye')).toBe('immediate');
    expect(parseFinancing('home loan lunga')).toBe('loan');
    expect(parseFinancing('cash payment karunga')).toBe('self_funded');
  });

  it('parses locality in both word orders', () => {
    expect(parseLocation('Wakad mein dekh raha hoon', LOCALITIES)).toBe('Wakad');
    expect(parseLocation('looking in Baner', LOCALITIES)).toBe('Baner');
    expect(parseLocation('Kharadi ke paas', LOCALITIES)).toBe('Kharadi');
  });

  it('does not mistake a time expression for a locality', () => {
    expect(parseLocation('teen mahine mein finalise karunga', LOCALITIES)).toBeNull();
  });

  it('parses names without guessing from bare tokens', () => {
    expect(parseName('Mera naam Rohit Sharma hai')).toBe('Rohit Sharma');
    expect(parseName('My name is Priya Nair')).toBe('Priya Nair');
    expect(parseName('Naam Amit hai')).toBe('Amit');
    expect(parseName('haan bataiye')).toBeNull();
  });
});

describe('detectSituations', () => {
  it('detects opt-out in all three registers', () => {
    expect(detectSituations('mujhe interest nahin hai')).toContain('opt_out');
    expect(detectSituations('I am not interested')).toContain('opt_out');
    expect(detectSituations('नहीं चाहिए')).toContain('opt_out');
  });

  it('detects hostility, wrong numbers and AI questions', () => {
    expect(detectSituations('ye kya bakwas hai')).toContain('hostile');
    expect(detectSituations('galat number hai')).toContain('wrong_number');
    expect(detectSituations('aap human ho ya robot')).toContain('is_human');
    expect(detectSituations('mera number kaise mila')).toContain('how_got_number');
    expect(detectSituations('aap kaun bol rahe hain')).toContain('who_is_this');
  });

  it('detects a refusal to answer', () => {
    expect(detectSituations('number nahi dena chahta')).toContain('declines_slot');
  });

  it('recognises bare acknowledgements', () => {
    expect(detectSituations('haan ji')).toContain('affirmative');
    expect(detectSituations('nahi')).toContain('negative');
    // Not a bare acknowledgement — it carries content.
    expect(detectSituations('haan mujhe 2 BHK chahiye')).not.toContain('affirmative');
  });

  it('maps objections', () => {
    expect(detectObjection('bahut mehenga hai')).toBe('too_expensive');
    expect(detectObjection('discount milega?')).toBe('discount');
    expect(detectObjection('family se discuss karna hoga')).toBe('need_to_discuss');
  });
});

describe('parseVisitDateTime', () => {
  // A fixed Wednesday so weekday arithmetic is deterministic.
  const now = new Date('2026-03-04T10:00:00+05:30');

  it('resolves relative Hindi days', () => {
    expect(parseVisitDateTime('kal shaam', now)?.scheduledFor.getDate()).toBe(5);
    expect(parseVisitDateTime('parso subah', now)?.scheduledFor.getDate()).toBe(6);
  });

  it('resolves the next occurrence of a weekday', () => {
    const sunday = parseVisitDateTime('this Sunday', now);
    expect(sunday?.scheduledFor.getDay()).toBe(0);
    expect(sunday?.scheduledFor.getDate()).toBe(8);
  });

  it('applies the time of day', () => {
    expect(parseVisitDateTime('kal shaam', now)?.scheduledFor.getHours()).toBe(17);
    expect(parseVisitDateTime('kal subah', now)?.scheduledFor.getHours()).toBe(10);
    expect(parseVisitDateTime('kal 4 pm', now)?.scheduledFor.getHours()).toBe(16);
  });

  it('reads "5 baje" as the evening, which is what a site visit means', () => {
    expect(parseVisitDateTime('kal 5 baje', now)?.scheduledFor.getHours()).toBe(17);
  });

  it('flags when the time was assumed rather than stated', () => {
    expect(parseVisitDateTime('this Sunday', now)?.timeAssumed).toBe(true);
    expect(parseVisitDateTime('Sunday 4 pm', now)?.timeAssumed).toBe(false);
  });

  it('returns null when no date is present', () => {
    expect(parseVisitDateTime('mujhe 2 BHK chahiye', now)).toBeNull();
  });
});
