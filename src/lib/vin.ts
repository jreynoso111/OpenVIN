/**
 * VIN normalization and ISO 3779 validation.
 * Pure functions — no I/O.
 */

const VIN_LENGTH = 17;
const CHECK_DIGIT_POSITION = 8; // zero-based index of position 9
const SQUISH_LENGTH = 11;
const FORBIDDEN_CHARS = /[IOQ]/;
const VALID_CHARS = /^[A-HJ-NPR-Z0-9]+$/;

/** ISO 3779 transliteration values for letters (I, O, Q are never valid). */
const TRANSLITERATION: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

/** Per-position weights for the check-digit computation. */
const WEIGHTS: readonly number[] = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Trim, uppercase, and strip spaces/hyphens from user input. */
export function normalizeVin(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

/** First 11 characters — the NHTSA "squish" VIN used to match complaint records. */
export function squishVin(vin: string): string {
  return vin.slice(0, SQUISH_LENGTH);
}

function charValue(char: string): number {
  if (char >= '0' && char <= '9') return Number(char);
  return TRANSLITERATION[char] ?? 0;
}

function computeCheckDigit(vin: string): string {
  const sum = [...vin].reduce(
    (acc, char, index) => acc + charValue(char) * (WEIGHTS[index] ?? 0),
    0,
  );
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

export type VinValidation = { valid: true } | { valid: false; error: string };

/**
 * Check digits are mandated only for vehicles built in North America
 * (WMI first character 1–5, per FMVSS 565 / Canadian CMVSS). European and
 * other-market VINs use position 9 as ordinary VDS data, so enforcing the
 * ISO 3779 check digit there would wrongly reject legitimate VINs.
 */
const NA_WMI_PREFIX = /^[1-5]/;

/**
 * Validate a (normalized) VIN: length and character set for all VINs, plus
 * the ISO 3779 check digit in position 9 for North-American-built vehicles.
 */
export function validateVin(vin: string): VinValidation {
  if (vin.length === 0) {
    return { valid: false, error: 'Enter a VIN — it is 17 characters long.' };
  }
  if (vin.length !== VIN_LENGTH) {
    return {
      valid: false,
      error: `A VIN is exactly 17 characters — this one has ${vin.length}.`,
    };
  }
  const forbidden = vin.match(FORBIDDEN_CHARS);
  if (forbidden) {
    return {
      valid: false,
      error: `VINs never contain the letter ${forbidden[0]} — check for a mistyped 0 or 1.`,
    };
  }
  if (!VALID_CHARS.test(vin)) {
    return {
      valid: false,
      error: 'VINs contain only letters A–Z (except I, O, Q) and digits 0–9.',
    };
  }
  if (NA_WMI_PREFIX.test(vin)) {
    const expected = computeCheckDigit(vin);
    const actual = vin[CHECK_DIGIT_POSITION];
    if (actual !== expected) {
      return {
        valid: false,
        error: `Check digit mismatch (position 9 is "${actual}", expected "${expected}") — one or more characters are mistyped.`,
      };
    }
  }
  return { valid: true };
}
