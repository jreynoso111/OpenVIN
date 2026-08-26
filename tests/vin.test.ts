import { describe, expect, test } from 'vitest';
import { normalizeVin, squishVin, validateVin } from '../src/lib/vin';

describe('normalizeVin', () => {
  test('trims, uppercases, and strips spaces and hyphens', () => {
    expect(normalizeVin('  1hgcm-8263 3a00-4352 ')).toBe('1HGCM82633A004352');
  });

  test('leaves an already-clean VIN untouched', () => {
    expect(normalizeVin('1HGCM82633A004352')).toBe('1HGCM82633A004352');
  });
});

describe('squishVin', () => {
  test('returns the first 11 characters', () => {
    expect(squishVin('1HGCM82633A004352')).toBe('1HGCM82633A');
  });
});

describe('validateVin', () => {
  test('accepts a known-valid VIN (1HGCM82633A004352)', () => {
    expect(validateVin('1HGCM82633A004352')).toEqual({ valid: true });
  });

  test('accepts a VIN whose check digit is X (1M8GDM9AXKP042788)', () => {
    expect(validateVin('1M8GDM9AXKP042788')).toEqual({ valid: true });
  });

  test('rejects a bad check digit with a clear message', () => {
    const result = validateVin('1HGCM82634A004352'); // 9th char 3 → 4
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/check digit/i);
  });

  test('does not enforce the check digit on European-built VINs', () => {
    // EU-market VINs use position 9 as ordinary VDS data, not a check digit.
    expect(validateVin('VF7SA5FX8EW123456')).toEqual({ valid: true }); // France
    expect(validateVin('WVWZZZ1JZ3W386752')).toEqual({ valid: true }); // Germany
  });

  test.each(['I', 'O', 'Q'])('rejects the forbidden letter %s', (letter) => {
    const result = validateVin(`1HGCM8263${letter}A004352`.slice(0, 17));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain(letter);
  });

  test('rejects wrong lengths with the observed count', () => {
    const short = validateVin('1HGCM82633A');
    expect(short.valid).toBe(false);
    if (!short.valid) expect(short.error).toContain('11');

    const long = validateVin('1HGCM82633A0043521');
    expect(long.valid).toBe(false);
    if (!long.valid) expect(long.error).toContain('18');
  });

  test('rejects the empty string', () => {
    expect(validateVin('').valid).toBe(false);
  });

  test('rejects invalid symbols', () => {
    const result = validateVin('1HGCM8263*A004352');
    expect(result.valid).toBe(false);
  });

  test('valid after normalization of messy input', () => {
    expect(validateVin(normalizeVin(' 1hg-cm82633a004352 '))).toEqual({ valid: true });
  });
});
