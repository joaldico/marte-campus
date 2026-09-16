/**
 * Seed (T-3.2). durationSeconds measured 2026-09-16 from ISO BMFF mvhd.
 * Integer rule: Math.round(mvhd.duration / mvhd.timescale). See DECISIONS.md.
 *
 * Playback rows go through domain ingest() before insert. Rejected rows
 * (inverted_interval, unknown_video) are still persisted. No Video row for rio.
 */
import { PrismaClient, type CourseStatus, type RevisionStatus, type Role } from '@prisma/client';
import { ingest } from '../src/domain/ingest';
import { uniqueSeconds } from '../src/domain/progress';

export type SeedVideo = {
  id: string;
  url: string;
  durationSeconds: number;
};

export const VIDEO_DURATIONS: readonly SeedVideo[] = [
  {
    id: 'playa',
    url: 'https://archive.org/download/Flickr-4360457374/03b_Dockwiler_Beach_-_Ocean_Waves-4360457374.mp4',
    durationSeconds: 10,
  },
  {
    id: 'cascada',
    url: 'https://archive.org/download/HiddenWaterfall2WS/HiddenWaterfall2WS_512kb.mp4',
    durationSeconds: 11,
  },
  {
    id: 'bosque',
    url: 'https://archive.org/download/SilentForestCCBYNatureClip/Silent%20Forest%20CC-BY%20NatureClip%20.mp4',
    durationSeconds: 20,
  },
  {
    id: 'atardecer',
    url: 'https://archive.org/download/Flickr-5419851044/timelapse_gear_test_-_the_sunset_that_hid_behind_the_clouds-5419851044.mp4',
    durationSeconds: 27,
  },
  {
    id: 'auroras',
    url: 'https://archive.org/download/Flickr-10745021235/Northern_lights_timelapse-10745021235.mp4',
    durationSeconds: 28,
  },
  {
    id: 'largo',
    url: 'https://archive.org/download/VermontWaterfallEarlySpring/VermontWaterfallSunsetGlancesbyedwardhuse2011edhuse.com1hd720_512kb.mp4',
    durationSeconds: 104,
  },
];

export type SeedUser = { id: string; name: string; role: Role };

export const SEED_USERS: readonly SeedUser[] = [
  { id: 'ana', name: 'Ana', role: 'admin' },
  { id: 'bruno', name: 'Bruno', role: 'student' },
  { id: 'carla', name: 'Carla', role: 'student' },
  { id: 'diego', name: 'Diego', role: 'student' },
];

export type SeedChapter = {
  id: string;
  title: string;
  videoId: string;
  position: number;
};

export type SeedCourse = {
  id: string;
  title: string;
  status: CourseStatus;
  version: {
    id: string;
    revisionStatus: RevisionStatus;
    versionNumber: number;
    chapters: readonly SeedChapter[];
  };
};

export const SEED_COURSES: readonly SeedCourse[] = [
  {
    id: 'paisajes-i',
    title: 'Paisajes I',
    status: 'published',
    version: {
      id: 'paisajes-i-v1',
      revisionStatus: 'published',
      versionNumber: 1,
      chapters: [
        { id: 'paisajes-i-ch-1', title: 'Playa', videoId: 'playa', position: 1 },
        { id: 'paisajes-i-ch-2', title: 'Cascada', videoId: 'cascada', position: 2 },
        { id: 'paisajes-i-ch-3', title: 'Bosque', videoId: 'bosque', position: 3 },
      ],
    },
  },
  {
    id: 'paisajes-ii',
    title: 'Paisajes II',
    status: 'in_review',
    version: {
      id: 'paisajes-ii-v1',
      revisionStatus: 'in_review',
      versionNumber: 1,
      chapters: [
        { id: 'paisajes-ii-ch-1', title: 'Cascada larga', videoId: 'largo', position: 1 },
        { id: 'paisajes-ii-ch-2', title: 'Atardecer', videoId: 'atardecer', position: 2 },
      ],
    },
  },
  {
    id: 'paisajes-iii',
    title: 'Paisajes III',
    status: 'draft',
    version: {
      id: 'paisajes-iii-v1',
      revisionStatus: 'draft',
      versionNumber: 1,
      chapters: [],
    },
  },
];

export const SEED_ENROLLMENTS: readonly { userId: string; courseId: string }[] = [
  { userId: 'bruno', courseId: 'paisajes-i' },
  { userId: 'carla', courseId: 'paisajes-i' },
];

export type SeedPlaybackCsvRow = {
  id: string;
  userId: string;
  videoId: string;
  from: number;
  to: number;
  rate: number;
  at: Date;
};

const SEED_AT = new Date('2026-09-16T12:00:00.000Z');

/** Spec 2.2.4 CSV (dirty rows included). */
export const SEED_PLAYBACK_CSV: readonly SeedPlaybackCsvRow[] = [
  { id: 'seed-ev-01', userId: 'bruno', videoId: 'playa', from: 0, to: 10, rate: 1, at: SEED_AT },
  { id: 'seed-ev-02', userId: 'bruno', videoId: 'cascada', from: 0, to: 4, rate: 1, at: SEED_AT },
  { id: 'seed-ev-03', userId: 'bruno', videoId: 'cascada', from: 3, to: 7, rate: 1, at: SEED_AT },
  { id: 'seed-ev-04', userId: 'bruno', videoId: 'cascada', from: 8, to: 11, rate: 1, at: SEED_AT },
  { id: 'seed-ev-05', userId: 'bruno', videoId: 'cascada', from: 0, to: 4, rate: 1, at: SEED_AT },
  { id: 'seed-ev-06', userId: 'bruno', videoId: 'atardecer', from: 0, to: 27, rate: 1, at: SEED_AT },
  { id: 'seed-ev-07', userId: 'carla', videoId: 'playa', from: 5, to: 10, rate: 2, at: SEED_AT },
  { id: 'seed-ev-08', userId: 'carla', videoId: 'playa', from: 0, to: 5, rate: 2, at: SEED_AT },
  { id: 'seed-ev-09', userId: 'carla', videoId: 'playa', from: 2, to: 4, rate: 1, at: SEED_AT },
  { id: 'seed-ev-10', userId: 'carla', videoId: 'cascada', from: 8, to: 2, rate: 1, at: SEED_AT },
  { id: 'seed-ev-11', userId: 'carla', videoId: 'bosque', from: 0, to: 25, rate: 1, at: SEED_AT },
  { id: 'seed-ev-12', userId: 'carla', videoId: 'rio', from: 0, to: 10, rate: 1, at: SEED_AT },
  { id: 'seed-ev-13', userId: 'diego', videoId: 'playa', from: 0, to: 10, rate: 1, at: SEED_AT },
];

export type SeedPlaybackRecord = {
  id: string;
  userId: string;
  videoId: string;
  fromS: number;
  toS: number;
  rate: number;
  at: Date;
  accepted: boolean;
  rejectReason: string | null;
};

export function seedIngestContext() {
  return {
    videoIds: new Set(VIDEO_DURATIONS.map((video) => video.id)),
    userIds: new Set(SEED_USERS.map((user) => user.id)),
  };
}

export function buildSeedPlaybackRecords(): SeedPlaybackRecord[] {
  const ctx = seedIngestContext();
  return SEED_PLAYBACK_CSV.map((row) => {
    const result = ingest(
      {
        userId: row.userId,
        videoId: row.videoId,
        from: row.from,
        to: row.to,
        rate: row.rate,
        at: row.at,
      },
      ctx,
    );
    return {
      id: row.id,
      userId: row.userId,
      videoId: row.videoId,
      fromS: row.from,
      toS: row.to,
      rate: row.rate,
      at: row.at,
      accepted: result.accepted,
      rejectReason: result.accepted ? null : result.reason,
    };
  });
}

export async function seed(prisma: PrismaClient): Promise<void> {
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { name: user.name, role: user.role },
      create: { id: user.id, name: user.name, role: user.role },
    });
  }

  for (const video of VIDEO_DURATIONS) {
    await prisma.video.upsert({
      where: { id: video.id },
      update: { url: video.url, durationSeconds: video.durationSeconds },
      create: {
        id: video.id,
        url: video.url,
        durationSeconds: video.durationSeconds,
      },
    });
  }

  for (const course of SEED_COURSES) {
    await prisma.course.upsert({
      where: { id: course.id },
      update: { title: course.title, status: course.status },
      create: { id: course.id, title: course.title, status: course.status },
    });

    await prisma.courseVersion.upsert({
      where: { id: course.version.id },
      update: {
        courseId: course.id,
        revisionStatus: course.version.revisionStatus,
        versionNumber: course.version.versionNumber,
      },
      create: {
        id: course.version.id,
        courseId: course.id,
        revisionStatus: course.version.revisionStatus,
        versionNumber: course.version.versionNumber,
      },
    });

    for (const chapter of course.version.chapters) {
      await prisma.chapter.upsert({
        where: { id: chapter.id },
        update: {
          versionId: course.version.id,
          videoId: chapter.videoId,
          title: chapter.title,
          position: chapter.position,
        },
        create: {
          id: chapter.id,
          versionId: course.version.id,
          videoId: chapter.videoId,
          title: chapter.title,
          position: chapter.position,
        },
      });
    }

    await prisma.course.update({
      where: { id: course.id },
      data: {
        publishedVersionId: course.status === 'published' ? course.version.id : null,
        workingVersionId: course.version.id,
      },
    });
  }

  for (const enrollment of SEED_ENROLLMENTS) {
    await prisma.enrollment.upsert({
      where: {
        userId_courseId: { userId: enrollment.userId, courseId: enrollment.courseId },
      },
      update: {},
      create: {
        id: `enroll-${enrollment.userId}-${enrollment.courseId}`,
        userId: enrollment.userId,
        courseId: enrollment.courseId,
      },
    });
  }

  for (const row of buildSeedPlaybackRecords()) {
    await prisma.playbackEvent.upsert({
      where: { id: row.id },
      update: {
        userId: row.userId,
        videoId: row.videoId,
        fromS: row.fromS,
        toS: row.toS,
        rate: row.rate,
        at: row.at,
        accepted: row.accepted,
        rejectReason: row.rejectReason,
      },
      create: row,
    });
  }
}

function printVideos(): void {
  for (const video of VIDEO_DURATIONS) {
    console.log(
      JSON.stringify({ id: video.id, url: video.url, durationSeconds: video.durationSeconds }),
    );
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    const brunoCascada = await prisma.playbackEvent.findMany({
      where: { userId: 'bruno', videoId: 'cascada', accepted: true },
    });
    const seconds = uniqueSeconds(
      brunoCascada.map((event) => ({ from: event.fromS, to: event.toS })),
    );
    console.log(JSON.stringify({ uniqueSecondsBrunoCascada: seconds }));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  if (process.argv.includes('--print')) {
    printVideos();
  } else {
    main().catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  }
}
