import { merge, uniqueSeconds, chapterProgress, courseProgress } from '../../src/domain/progress';

describe('ProgressEngine.merge + uniqueSeconds', () => {
  it('Bruno cascada seed unions to 10s', () => {
    const merged = merge([
      { from: 0, to: 4 },
      { from: 3, to: 7 },
      { from: 8, to: 11 },
      { from: 0, to: 4 },
    ]);
    expect(uniqueSeconds(merged)).toBe(10);
  });

  it('Carla playa [5,10)+[0,5)+[2,4) unions to 10s', () => {
    const merged = merge([
      { from: 5, to: 10 },
      { from: 0, to: 5 },
      { from: 2, to: 4 },
    ]);
    expect(uniqueSeconds(merged)).toBe(10);
  });
});

describe('chapterProgress', () => {
  it('duration 10 unique 9 is completed with ratio 0.9', () => {
    const result = chapterProgress(9, 10);
    expect(result.ratio).toBe(0.9);
    expect(result.completed).toBe(true);
    expect(result.uniqueSeconds).toBe(9);
    expect(result.durationSeconds).toBe(10);
  });

  it('duration 10 unique 8.9 is not completed', () => {
    const result = chapterProgress(8.9, 10);
    expect(result.ratio).toBeCloseTo(0.89);
    expect(result.completed).toBe(false);
  });

  it('duration <= 0 or missing yields ratio 0 and not completed', () => {
    expect(chapterProgress(5, 0)).toMatchObject({ ratio: 0, completed: false });
    expect(chapterProgress(5, -3)).toMatchObject({ ratio: 0, completed: false });
    expect(chapterProgress(5, null)).toMatchObject({ ratio: 0, completed: false });
    expect(chapterProgress(5, undefined)).toMatchObject({ ratio: 0, completed: false });
  });

  it('clamps ratio to [0, 1]', () => {
    expect(chapterProgress(15, 10).ratio).toBe(1);
    expect(chapterProgress(-2, 10).ratio).toBe(0);
  });
});

describe('courseProgress', () => {
  it('is the arithmetic mean of chapter ratios with completedCount and totalCount', () => {
    const chapters = [chapterProgress(9, 10), chapterProgress(8.9, 10)];
    const result = courseProgress(chapters);
    expect(result.averageRatio).toBeCloseTo((0.9 + 0.89) / 2);
    expect(result.completedCount).toBe(1);
    expect(result.totalCount).toBe(2);
  });
});
