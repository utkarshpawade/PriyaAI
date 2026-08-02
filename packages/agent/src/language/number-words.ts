import { CRORE, LAKH, type Language } from '@rvagent/shared';

/**
 * Number-to-words for the three registers the agent speaks.
 *
 * Hindi cardinals 0–100 are irregular (there is no rule that gets you from 8
 * and 80 to "athaasi"), so a table is the only honest implementation. Both a
 * romanised and a Devanagari column are kept because the same digit has to be
 * spoken by a Hinglish voice reading Latin script and a Hindi voice reading
 * Devanagari.
 */

const HINDI_ROMAN: readonly string[] = [
  'shunya', 'ek', 'do', 'teen', 'chaar', 'paanch', 'chhah', 'saat', 'aath', 'nau',
  'das', 'gyaarah', 'baarah', 'terah', 'chaudah', 'pandrah', 'solah', 'satrah', 'atthaarah', 'unnees',
  'bees', 'ikkees', 'baaees', 'teees', 'chaubees', 'pachchees', 'chhabbees', 'sattaaees', 'atthaaees', 'untees',
  'tees', 'ikattees', 'battees', 'taintees', 'chauntees', 'paintees', 'chhattees', 'saintees', 'adhtees', 'untaalees',
  'chaalees', 'iktaalees', 'bayaalees', 'taintaalees', 'chavaalees', 'paintaalees', 'chhiyaalees', 'saintaalees', 'adtaalees', 'unchaas',
  'pachaas', 'ikyaavan', 'baavan', 'tirpan', 'chauvan', 'pachpan', 'chhappan', 'sattaavan', 'atthaavan', 'unsath',
  'saath', 'iksath', 'baasath', 'tirsath', 'chausath', 'painsath', 'chhiyaasath', 'sarsath', 'adsath', 'unhattar',
  'sattar', 'ikhattar', 'bahattar', 'tihattar', 'chauhattar', 'pachhattar', 'chhihattar', 'satattar', 'athhattar', 'unaasi',
  'assi', 'ikyaasi', 'bayaasi', 'tiraasi', 'chauraasi', 'pachaasi', 'chhiyaasi', 'sataasi', 'athaasi', 'navaasi',
  'nabbe', 'ikyaanave', 'baanave', 'tiraanave', 'chauraanave', 'pachaanave', 'chhiyaanave', 'sataanave', 'atthaanave', 'ninyaanave',
  'sau',
];

const HINDI_DEVANAGARI: readonly string[] = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ',
  'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकत्तीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सरसठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उन्यासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
  'सौ',
];

const ENGLISH_ONES: readonly string[] = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const ENGLISH_TENS: readonly string[] = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
];

/** Words for 0–100. Above 100 the caller-facing amounts are always lakh/crore. */
export function numberToWords(value: number, language: Language): string {
  const rounded = Math.round(value);
  if (rounded < 0) return String(rounded);

  if (language === 'en') return englishNumberToWords(rounded);

  const table = language === 'hi' ? HINDI_DEVANAGARI : HINDI_ROMAN;
  if (rounded <= 100) return table[rounded];
  return String(rounded);
}

function englishNumberToWords(value: number): string {
  if (value < 20) return ENGLISH_ONES[value];
  if (value === 100) return 'one hundred';
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return ones === 0 ? ENGLISH_TENS[tens] : `${ENGLISH_TENS[tens]}-${ENGLISH_ONES[ones]}`;
  }
  return String(value);
}

const UNIT_WORDS: Record<Language, { lakh: string; crore: string; rupees: string; point: string }> = {
  hi: { lakh: 'लाख', crore: 'करोड़', rupees: 'रुपये', point: 'दशमलव' },
  'hi-en': { lakh: 'lakh', crore: 'crore', rupees: 'rupees', point: 'point' },
  en: { lakh: 'lakh', crore: 'crore', rupees: 'rupees', point: 'point' },
};

/**
 * Speaks a rupee amount the way an Indian sales executive would.
 *
 * `8_500_000` becomes "pachaasi lakh rupees" in Hinglish, "eighty-five lakh
 * rupees" in English, and "पचासी लाख रुपये" in Hindi. Fractional crores keep the
 * decimal ("ek point two crore") because that is how people actually say 1.2 Cr.
 */
export function amountToWords(amountInr: number, language: Language, includeRupees = true): string {
  if (!Number.isFinite(amountInr) || amountInr <= 0) return '';
  const units = UNIT_WORDS[language];
  const rupees = includeRupees ? ` ${units.rupees}` : '';

  if (amountInr >= CRORE) {
    return `${decimalToWords(amountInr / CRORE, language)} ${units.crore}${rupees}`.trim();
  }
  if (amountInr >= LAKH) {
    return `${decimalToWords(amountInr / LAKH, language)} ${units.lakh}${rupees}`.trim();
  }
  if (amountInr >= 1_000) {
    const thousands = amountInr / 1_000;
    const word = language === 'hi' ? 'हज़ार' : 'thousand';
    return `${decimalToWords(thousands, language)} ${word}${rupees}`.trim();
  }
  return `${numberToWords(amountInr, language)}${rupees}`.trim();
}

/** `1.2` -> "ek point two" (Hinglish) / "one point two" (English). */
function decimalToWords(value: number, language: Language): string {
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.floor(rounded);
  const fraction = Math.round((rounded - whole) * 100);

  if (fraction === 0) return numberToWords(whole, language);

  const units = UNIT_WORDS[language];
  // Decimal digits are read individually, and Hinglish speakers switch to
  // English digits after "point" — "ek point two", never "ek point do".
  const digitLanguage: Language = language === 'hi' ? 'hi' : 'en';
  const digits = String(fraction % 10 === 0 ? fraction / 10 : fraction)
    .split('')
    .map((digit) => numberToWords(Number(digit), digitLanguage))
    .join(' ');

  return `${numberToWords(whole, language)} ${units.point} ${digits}`;
}

/**
 * Reverse lookup: spoken number word -> value. Built from the same tables, so
 * "pachaasi", "पचासी" and "eighty-five" all resolve to 85 and cannot drift
 * out of sync with the forward direction.
 */
const WORD_TO_NUMBER: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  const add = (word: string, value: number) => {
    const key = word.toLowerCase().replace(/[\s-]/g, '');
    if (!map.has(key)) map.set(key, value);
  };

  HINDI_ROMAN.forEach((word, value) => add(word, value));
  HINDI_DEVANAGARI.forEach((word, value) => add(word, value));
  ENGLISH_ONES.forEach((word, value) => add(word, value));
  ENGLISH_TENS.forEach((word, tens) => {
    if (!word) return;
    add(word, tens * 10);
    ENGLISH_ONES.slice(1, 10).forEach((ones, index) => add(`${word}${ones}`, tens * 10 + index + 1));
  });

  // Common romanisation variants heard on real calls.
  const variants: ReadonlyArray<readonly [string, number]> = [
    ['pachas', 50], ['pachaas', 50], ['saath', 60], ['sattar', 70], ['assi', 80], ['asi', 80],
    ['nabbe', 90], ['navve', 90], ['chalees', 40], ['chalis', 40], ['tees', 30], ['tis', 30],
    ['bees', 20], ['bis', 20], ['paanch', 5], ['panch', 5], ['chhe', 6], ['che', 6], ['chah', 6],
    ['satrah', 17], ['pandra', 15], ['pandrah', 15], ['barah', 12], ['bara', 12], ['pachattar', 75],
    ['pachhattar', 75], ['pachasi', 85], ['pachaasi', 85], ['sava', 1], ['dedh', 1], ['dhai', 2],
  ];
  variants.forEach(([word, value]) => add(word, value));
  return map;
})();

/** Resolves a single spoken numeral to its value, or null if it is not one. */
export function wordToNumber(word: string): number | null {
  const key = word.toLowerCase().replace(/[\s-]/g, '');
  return WORD_TO_NUMBER.get(key) ?? null;
}

/** Devanagari digits (०१२...) normalised to ASCII so one regex set covers both. */
export function normaliseDevanagariDigits(text: string): string {
  return text.replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)));
}

/** Reads a phone number digit by digit, which is the only way it lands correctly. */
export function digitsToWords(digits: string, language: Language): string {
  return digits
    .replace(/\D/g, '')
    .split('')
    .map((digit) => numberToWords(Number(digit), language))
    .join(' ');
}
