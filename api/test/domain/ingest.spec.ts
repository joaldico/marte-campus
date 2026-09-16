import { ingest } from '../../src/domain/ingest';

const ctx = {
  videoIds: new Set(['playa', 'cascada', 'bosque', 'atardecer', 'auroras', 'largo']),
  userIds: new Set(['ana', 'bruno', 'carla', 'diego']),
};

const at = new Date('2026-09-16T00:00:00Z');

describe('PlaybackIngestor', () => {
  it('accepts Bruno playa 0–10', () => {
    const result = ingest(
      { userId: 'bruno', videoId: 'playa', from: 0, to: 10, rate: 1, at },
      ctx,
    );
    expect(result).toEqual({ accepted: true });
  });

  it('rejects Carla cascada 8–2 as inverted_interval', () => {
    const result = ingest(
      { userId: 'carla', videoId: 'cascada', from: 8, to: 2, rate: 1, at },
      ctx,
    );
    expect(result).toEqual({ accepted: false, reason: 'inverted_interval' });
  });

  it('rejects from === to as inverted_interval', () => {
    const result = ingest(
      { userId: 'bruno', videoId: 'playa', from: 4, to: 4, rate: 1, at },
      ctx,
    );
    expect(result).toEqual({ accepted: false, reason: 'inverted_interval' });
  });

  it('rejects rio as unknown_video', () => {
    const result = ingest(
      { userId: 'carla', videoId: 'rio', from: 0, to: 10, rate: 1, at },
      ctx,
    );
    expect(result).toEqual({ accepted: false, reason: 'unknown_video' });
  });

  it('rejects an unknown user', () => {
    const result = ingest(
      { userId: 'eve', videoId: 'playa', from: 0, to: 10, rate: 1, at },
      ctx,
    );
    expect(result).toEqual({ accepted: false, reason: 'unknown_user' });
  });

  it('rejects negative from or to as negative_or_nan', () => {
    expect(
      ingest({ userId: 'bruno', videoId: 'playa', from: -1, to: 10, rate: 1, at }, ctx),
    ).toEqual({ accepted: false, reason: 'negative_or_nan' });
    expect(
      ingest({ userId: 'bruno', videoId: 'playa', from: 0, to: -1, rate: 1, at }, ctx),
    ).toEqual({ accepted: false, reason: 'negative_or_nan' });
  });

  it('rejects NaN from, to, or rate as negative_or_nan', () => {
    expect(
      ingest({ userId: 'bruno', videoId: 'playa', from: Number.NaN, to: 10, rate: 1, at }, ctx),
    ).toEqual({ accepted: false, reason: 'negative_or_nan' });
    expect(
      ingest({ userId: 'bruno', videoId: 'playa', from: 0, to: Number.NaN, rate: 1, at }, ctx),
    ).toEqual({ accepted: false, reason: 'negative_or_nan' });
    expect(
      ingest({ userId: 'bruno', videoId: 'playa', from: 0, to: 10, rate: Number.NaN, at }, ctx),
    ).toEqual({ accepted: false, reason: 'negative_or_nan' });
  });

  it('rejects rate ≤ 0 as rate_not_positive', () => {
    expect(
      ingest({ userId: 'bruno', videoId: 'playa', from: 0, to: 10, rate: 0, at }, ctx),
    ).toEqual({ accepted: false, reason: 'rate_not_positive' });
    expect(
      ingest({ userId: 'bruno', videoId: 'playa', from: 0, to: 10, rate: -1, at }, ctx),
    ).toEqual({ accepted: false, reason: 'rate_not_positive' });
  });
});
