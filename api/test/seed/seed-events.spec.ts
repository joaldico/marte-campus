import { merge, uniqueSeconds } from '../../src/domain/progress';
import {
  SEED_PLAYBACK_CURSORS,
  VIDEO_DURATIONS,
  buildSeedPlaybackRecords,
} from '../../prisma/seed';

function acceptedIntervals(userId: string, videoId: string) {
  return buildSeedPlaybackRecords()
    .filter((row) => row.accepted && row.userId === userId && row.videoId === videoId)
    .map((row) => ({ from: row.fromS, to: row.toS }));
}

describe('seed playback CSV via ingest + merge', () => {
  it('uniqueSeconds(bruno, cascada) = 10', () => {
    expect(uniqueSeconds(acceptedIntervals('bruno', 'cascada'))).toBe(10);
  });

  it('keeps the rest of spec 2.2.4 unions after ingest', () => {
    expect(uniqueSeconds(acceptedIntervals('bruno', 'playa'))).toBe(10);
    expect(uniqueSeconds(acceptedIntervals('bruno', 'bosque'))).toBe(0);
    expect(uniqueSeconds(acceptedIntervals('bruno', 'atardecer'))).toBe(27);
    expect(uniqueSeconds(acceptedIntervals('carla', 'playa'))).toBe(10);
    expect(uniqueSeconds(acceptedIntervals('carla', 'cascada'))).toBe(0);
    expect(uniqueSeconds(acceptedIntervals('carla', 'bosque'))).toBe(25);
    expect(uniqueSeconds(acceptedIntervals('diego', 'playa'))).toBe(10);
  });

  it('persists rejected inverted_interval and unknown_video rows (no Video rio)', () => {
    const rows = buildSeedPlaybackRecords();
    const inverted = rows.find(
      (row) => row.userId === 'carla' && row.videoId === 'cascada' && row.fromS === 8,
    );
    const unknown = rows.find((row) => row.userId === 'carla' && row.videoId === 'rio');

    expect(inverted).toMatchObject({
      toS: 2,
      accepted: false,
      rejectReason: 'inverted_interval',
    });
    expect(unknown).toMatchObject({
      fromS: 0,
      toS: 10,
      accepted: false,
      rejectReason: 'unknown_video',
    });
    expect(VIDEO_DURATIONS.map((video) => video.id)).toEqual([
      'playa',
      'cascada',
      'bosque',
      'atardecer',
      'auroras',
      'largo',
    ]);
    expect(VIDEO_DURATIONS.some((video) => video.id === 'rio')).toBe(false);
  });

  it('seeds Carla playa PlaybackCursor at union end 10 so resume starts there', () => {
    const union = merge(acceptedIntervals('carla', 'playa'));
    expect(union).toEqual([{ from: 0, to: 10 }]);
    const carlaPlaya = SEED_PLAYBACK_CURSORS.find(
      (row) => row.userId === 'carla' && row.videoId === 'playa',
    );
    expect(carlaPlaya?.positionSeconds).toBe(10);
    expect(carlaPlaya?.positionSeconds).toBe(union[0].to);
  });
});
