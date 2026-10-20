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
    const [identity, ny, commercial, plateLinks, guidedLinks] =
      await Promise.all([
        handle.identity,
        handle.nyInspections,
        handle.commercialInspections,
        handle.plateLinks,
        handle.guidedLinks,
      ]);

    expect(identity.status).toBe('unavailable');
    expect(identity.note).toBeTruthy();
    expect(plateLinks).toEqual([]);
    for (const section of [ny, commercial]) {
      expect(section.status).toBe('unavailable');
      expect(section.note).toBeTruthy();
      expect(section.data).toBeUndefined();
    }
    for (const section of [await handle.recalls, await handle.complaints]) {
      expect(section.status).toBe('unavailable');
      expect(section.note).toBeTruthy();
    }
    // Guided links never depend on the network.
    expect(guidedLinks.length).toBeGreaterThan(0);
    expect(guidedLinks[0]?.kind).toBe('nmvtis');
  });

});
