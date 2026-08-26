import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { httpTuning } from '../src/lib/api/http';
import { startReport } from '../src/lib/report';

// No live endpoints: fetch is stubbed to fail, proving every section promise
// still resolves (never rejects) and degrades to 'unavailable'.

const PRODUCTION_TUNING = { ...httpTuning, retryDelaysMs: httpTuning.retryDelaysMs };

beforeEach(() => {
  // Zero the retry/pacing delays so stubbed-failure paths resolve instantly.
  httpTuning.retryDelaysMs = [];
  httpTuning.pacingGapMs = 0;
});

afterEach(() => {
  httpTuning.retryDelaysMs = PRODUCTION_TUNING.retryDelaysMs;
  httpTuning.pacingGapMs = PRODUCTION_TUNING.pacingGapMs;
  vi.unstubAllGlobals();
});

describe('startReport with an unreachable network', () => {
  test('every section resolves; none reject', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const handle = startReport(' 1hgcm82633a004352 ');
    const [identity, recalls, complaints, safety, ny, fuelEconomy, warranty, guidedLinks] =
      await Promise.all([
        handle.identity,
        handle.recalls,
        handle.complaints,
        handle.safety,
        handle.nyInspections,
        handle.fuelEconomy,
        handle.warranty,
        handle.guidedLinks,
      ]);

    expect(identity.status).toBe('unavailable');
    expect(identity.note).toBeTruthy();
    for (const section of [recalls, complaints, safety, ny, fuelEconomy, warranty]) {
      expect(section.status).toBe('unavailable');
      expect(section.note).toBeTruthy();
      expect(section.data).toBeUndefined();
    }
    // Guided links never depend on the network.
    expect(guidedLinks.length).toBeGreaterThan(0);
    expect(guidedLinks[0]?.kind).toBe('nmvtis');
  });

  test('dependent sections explain that the decode failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const handle = startReport('1HGCM82633A004352');
    const recalls = await handle.recalls;
    expect(recalls.note).toMatch(/decode/i);
  });
});
