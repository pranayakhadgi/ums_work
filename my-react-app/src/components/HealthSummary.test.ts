import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  healthTone,
  computeDownRanges,
  trimLeadingUnknownGlobally,
  sortBySeverity,
  type MonitorHistory,
} from './HealthSummary';

function makeHistory(statuses: MonitorStatus[]): MonitorHistory['history'] {
  return statuses.map((status, i) => ({
    timestamp: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    status,
  }));
}

type MonitorStatus = 'UP' | 'DOWN' | 'UNKNOWN';

describe('healthTone', () => {
  it('returns good for scores >= 99', () => {
    assert.equal(healthTone(99), 'good');
    assert.equal(healthTone(100), 'good');
  });

  it('returns warn for scores >= 95 and < 99', () => {
    assert.equal(healthTone(95), 'warn');
    assert.equal(healthTone(98), 'warn');
  });

  it('returns danger for scores < 95', () => {
    assert.equal(healthTone(94), 'danger');
    assert.equal(healthTone(0), 'danger');
  });
});

describe('computeDownRanges', () => {
  it('returns empty array when no downtime', () => {
    const data = [
      { t: '2026-01-01T00:00:00Z', isDown: false },
      { t: '2026-01-01T01:00:00Z', isDown: false },
    ];
    assert.deepEqual(computeDownRanges(data), []);
  });

  it('detects a single down range', () => {
    const data = [
      { t: '2026-01-01T00:00:00Z', isDown: false },
      { t: '2026-01-01T01:00:00Z', isDown: true },
      { t: '2026-01-01T02:00:00Z', isDown: true },
      { t: '2026-01-01T03:00:00Z', isDown: false },
    ];
    assert.deepEqual(computeDownRanges(data), [
      { x1: '2026-01-01T01:00:00Z', x2: '2026-01-01T02:00:00Z' },
    ]);
  });

  it('extends range to last point when downtime continues to end', () => {
    const data = [
      { t: '2026-01-01T00:00:00Z', isDown: true },
      { t: '2026-01-01T01:00:00Z', isDown: true },
    ];
    assert.deepEqual(computeDownRanges(data), [
      { x1: '2026-01-01T00:00:00Z', x2: '2026-01-01T01:00:00Z' },
    ]);
  });
});

describe('trimLeadingUnknownGlobally', () => {
  it('uses one shared cutoff so all rows stay time-aligned', () => {
    const monitors: MonitorHistory[] = [
      { id: 'a', name: 'A', url: 'http://a', history: makeHistory(['UNKNOWN', 'UNKNOWN', 'UP', 'DOWN', 'UP']) },
      { id: 'b', name: 'B', url: 'http://b', history: makeHistory(['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'DOWN']) },
    ];

    const { monitors: trimmed } = trimLeadingUnknownGlobally(monitors);
    assert.equal(trimmed[0].history.length, 3);
    assert.equal(trimmed[1].history.length, 3);
    assert.equal(trimmed[0].history[0].status, 'UP');
    assert.equal(trimmed[1].history[2].status, 'DOWN');
    assert.equal(trimmed[0].history[0].timestamp, trimmed[1].history[0].timestamp);
  });

  it('returns input unchanged when every bucket is UNKNOWN', () => {
    const monitors: MonitorHistory[] = [
      { id: 'a', name: 'A', url: 'http://a', history: makeHistory(['UNKNOWN', 'UNKNOWN']) },
    ];
    const result = trimLeadingUnknownGlobally(monitors);
    assert.equal(result.trimmedHours, 0);
    assert.equal(result.monitors[0].history.length, 2);
  });
});

describe('sortBySeverity', () => {
  it('sorts DOWN before UP regardless of name', () => {
    const monitors: MonitorHistory[] = [
      { id: 'up', name: 'Alpha', url: 'http://a', history: makeHistory(['UP']) },
      { id: 'down', name: 'Zulu', url: 'http://z', history: makeHistory(['DOWN']) },
    ];
    const sorted = sortBySeverity(monitors);
    assert.equal(sorted[0].id, 'down');
  });

  it('handles empty history without throwing', () => {
    const monitors: MonitorHistory[] = [
      { id: 'empty', name: 'Empty', url: 'http://e', history: [] },
      { id: 'up', name: 'Up', url: 'http://u', history: makeHistory(['UP']) },
    ];
    assert.doesNotThrow(() => sortBySeverity(monitors));
    assert.equal(sortBySeverity(monitors)[0].id, 'empty');
  });
});
