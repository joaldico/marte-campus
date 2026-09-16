import { build } from '../../src/domain/heatmap';
import type { Interval } from '../../src/domain/progress';

const BRUNO_CASCADA: Interval[] = [
  { from: 0, to: 4 },
  { from: 3, to: 7 },
  { from: 8, to: 11 },
  { from: 0, to: 4 },
];

describe('HeatmapEngine', () => {
  it('Bruno cascada seed leaves second 7 as the only skip gap', () => {
    const buckets = build(BRUNO_CASCADA, 11, 1);

    expect(buckets).toHaveLength(11);
    expect(buckets.map((bucket) => bucket.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    expect(buckets[7]).toEqual({ t: 7, watchedWeight: 0, skipWeight: 1 });

    for (const t of [0, 1, 2, 3, 4, 5, 6, 8, 9, 10]) {
      expect(buckets[t].watchedWeight).toBeGreaterThanOrEqual(1);
      expect(buckets[t].skipWeight).toBe(0);
    }
  });

  it('watchedWeight counts accepted events covering each second, not unique users', () => {
    const buckets = build(BRUNO_CASCADA, 11, 1);

    expect(buckets[0].watchedWeight).toBe(2);
    expect(buckets[3].watchedWeight).toBe(3);
    expect(buckets[4].watchedWeight).toBe(1);
    expect(buckets[8].watchedWeight).toBe(1);
  });
});
