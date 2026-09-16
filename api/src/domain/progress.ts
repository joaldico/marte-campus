export type Interval = { from: number; to: number };

export function merge(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((a, b) => a.from - b.from);
  const merged: Interval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = merged[merged.length - 1];
    const next = sorted[i];
    if (next.from <= current.to) {
      current.to = Math.max(current.to, next.to);
    } else {
      merged.push({ ...next });
    }
  }

  return merged;
}

export function uniqueSeconds(intervals: Interval[]): number {
  return merge(intervals).reduce((sum, interval) => sum + (interval.to - interval.from), 0);
}
