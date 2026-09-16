import type { Interval } from './progress';

export type HeatmapBucket = {
  t: number;
  watchedWeight: number;
  skipWeight: number;
};

export function build(
  events: Interval[],
  durationSeconds: number,
  bucketSize: number,
): HeatmapBucket[] {
  const buckets: HeatmapBucket[] = [];

  for (let t = 0; t < durationSeconds; t += bucketSize) {
    const watchedWeight = events.filter(
      (event) => event.from < t + bucketSize && event.to > t,
    ).length;
    buckets.push({
      t,
      watchedWeight,
      skipWeight: watchedWeight > 0 ? 0 : 1,
    });
  }

  return buckets;
}
