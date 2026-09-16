import { merge, uniqueSeconds } from '../../src/domain/progress';

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
