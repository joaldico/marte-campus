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

export type ChapterProgressView = {
  uniqueSeconds: number;
  durationSeconds: number;
  ratio: number;
  completed: boolean;
};

export function chapterProgress(
  uniqueSeconds: number,
  durationSeconds: number | null | undefined,
): ChapterProgressView {
  if (durationSeconds == null || durationSeconds <= 0) {
    return {
      uniqueSeconds,
      durationSeconds: durationSeconds ?? 0,
      ratio: 0,
      completed: false,
    };
  }

  const ratio = Math.min(1, Math.max(0, uniqueSeconds / durationSeconds));
  return {
    uniqueSeconds,
    durationSeconds,
    ratio,
    completed: ratio >= 0.9,
  };
}

export function courseProgress(chapters: ChapterProgressView[]): {
  averageRatio: number;
  completedCount: number;
  totalCount: number;
} {
  const totalCount = chapters.length;
  const completedCount = chapters.filter((chapter) => chapter.completed).length;
  const averageRatio =
    totalCount === 0
      ? 0
      : chapters.reduce((sum, chapter) => sum + chapter.ratio, 0) / totalCount;

  return { averageRatio, completedCount, totalCount };
}
