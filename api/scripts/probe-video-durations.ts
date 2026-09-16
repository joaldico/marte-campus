/**
 * Spike T-1.6: probe archive.org MP4 durations for spec 2.2.2.
 * Prefers ffprobe; otherwise parses ISO BMFF mvhd from the first 256 KiB (Range GET).
 * Run from api/: npx ts-node --transpile-only scripts/probe-video-durations.ts
 */
import { spawnSync } from 'node:child_process';

const VIDEOS: ReadonlyArray<{ id: string; url: string }> = [
  {
    id: 'playa',
    url: 'https://archive.org/download/Flickr-4360457374/03b_Dockwiler_Beach_-_Ocean_Waves-4360457374.mp4',
  },
  {
    id: 'cascada',
    url: 'https://archive.org/download/HiddenWaterfall2WS/HiddenWaterfall2WS_512kb.mp4',
  },
  {
    id: 'bosque',
    url: 'https://archive.org/download/SilentForestCCBYNatureClip/Silent%20Forest%20CC-BY%20NatureClip%20.mp4',
  },
  {
    id: 'atardecer',
    url: 'https://archive.org/download/Flickr-5419851044/timelapse_gear_test_-_the_sunset_that_hid_behind_the_clouds-5419851044.mp4',
  },
  {
    id: 'auroras',
    url: 'https://archive.org/download/Flickr-10745021235/Northern_lights_timelapse-10745021235.mp4',
  },
  {
    id: 'largo',
    url: 'https://archive.org/download/VermontWaterfallEarlySpring/VermontWaterfallSunsetGlancesbyedwardhuse2011edhuse.com1hd720_512kb.mp4',
  },
];

const HEAD_BYTES = 256 * 1024;
const UA = 'MarteCampus-Duration-Probe/1.0';

type Mvhd = {
  version: number;
  timescale: number;
  durationTicks: number;
  seconds: number;
};

type ProbeRow = {
  id: string;
  url: string;
  durationSeconds: number | null;
  seconds: number | null;
  timescale: number | null;
  durationTicks: number | null;
  method: string;
  contentLength: number | null;
  error: string | null;
};

function ffprobeAvailable(): boolean {
  const probe = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' });
  return probe.status === 0;
}

function ffprobeSeconds(url: string): number {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      url,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'ffprobe failed').trim());
  }
  const seconds = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe returned non-numeric duration: ${result.stdout.trim()}`);
  }
  return seconds;
}

function readU32(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

function readU64(buf: Buffer, offset: number): number {
  const hi = buf.readUInt32BE(offset);
  const lo = buf.readUInt32BE(offset + 4);
  return hi * 0x1_0000_0000 + lo;
}

function parseMvhd(payload: Buffer): Mvhd {
  if (payload.length < 4) {
    throw new Error('mvhd too short');
  }
  const version = payload[0];
  let timescale: number;
  let durationTicks: number;
  if (version === 1) {
    if (payload.length < 32) {
      throw new Error('mvhd v1 truncated');
    }
    timescale = readU32(payload, 20);
    durationTicks = readU64(payload, 24);
  } else {
    if (payload.length < 20) {
      throw new Error('mvhd v0 truncated');
    }
    timescale = readU32(payload, 12);
    durationTicks = readU32(payload, 16);
  }
  if (timescale <= 0) {
    throw new Error('mvhd timescale is 0');
  }
  return { version, timescale, durationTicks, seconds: durationTicks / timescale };
}

function walkBoxes(
  buf: Buffer,
  start: number,
  end: number,
  visit: (type: string, contentStart: number, contentEnd: number) => boolean,
): boolean {
  let pos = start;
  while (pos + 8 <= end) {
    let size = readU32(buf, pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('latin1');
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) {
        break;
      }
      size = readU64(buf, pos + 8);
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header) {
      break;
    }
    const boxEnd = Math.min(pos + size, end);
    const contentStart = pos + header;
    if (visit(type, contentStart, boxEnd)) {
      return true;
    }
    const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta', 'moof']);
    if (containers.has(type)) {
      if (walkBoxes(buf, contentStart, boxEnd, visit)) {
        return true;
      }
    }
    pos += size;
  }
  return false;
}

function findMvhd(buf: Buffer): Mvhd | null {
  let found: Mvhd | null = null;
  walkBoxes(buf, 0, buf.length, (type, contentStart, contentEnd) => {
    if (type !== 'mvhd') {
      return false;
    }
    found = parseMvhd(buf.subarray(contentStart, contentEnd));
    return true;
  });
  return found;
}

async function fetchRange(url: string, start: number, end: number): Promise<{ body: Buffer; contentRange: string | null; contentLength: number | null }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Range: `bytes=${start}-${end}`,
    },
    redirect: 'follow',
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`GET ${res.status} ${res.statusText}`);
  }
  const ab = await res.arrayBuffer();
  const contentRange = res.headers.get('content-range');
  let contentLength: number | null = null;
  const slash = contentRange?.split('/')[1];
  if (slash && slash !== '*') {
    contentLength = Number.parseInt(slash, 10);
  } else {
    const cl = res.headers.get('content-length');
    contentLength = cl ? Number.parseInt(cl, 10) : null;
  }
  return { body: Buffer.from(ab), contentRange, contentLength };
}

async function probeMvhd(url: string): Promise<{ mvhd: Mvhd; contentLength: number | null; method: string }> {
  const head = await fetchRange(url, 0, HEAD_BYTES - 1);
  const fromHead = findMvhd(head.body);
  if (fromHead) {
    return { mvhd: fromHead, contentLength: head.contentLength, method: 'mvhd-range-256KiB' };
  }
  throw new Error('mvhd not found in first 256 KiB');
}

async function probeOne(id: string, url: string, useFfprobe: boolean): Promise<ProbeRow> {
  try {
    if (useFfprobe) {
      const seconds = ffprobeSeconds(url);
      return {
        id,
        url,
        durationSeconds: Math.round(seconds),
        seconds,
        timescale: null,
        durationTicks: null,
        method: 'ffprobe',
        contentLength: null,
        error: null,
      };
    }
    const { mvhd, contentLength, method } = await probeMvhd(url);
    return {
      id,
      url,
      durationSeconds: Math.round(mvhd.seconds),
      seconds: mvhd.seconds,
      timescale: mvhd.timescale,
      durationTicks: mvhd.durationTicks,
      method,
      contentLength,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id,
      url,
      durationSeconds: null,
      seconds: null,
      timescale: null,
      durationTicks: null,
      method: useFfprobe ? 'ffprobe' : 'mvhd',
      contentLength: null,
      error: message,
    };
  }
}

async function main(): Promise<void> {
  const useFfprobe = ffprobeAvailable();
  console.log(`ffprobe=${useFfprobe ? 'yes' : 'no (using mvhd parser)'}`);
  console.log(
    'id\tdurationSeconds\tseconds\ttimescale\tdurationTicks\tmethod\tcontentLength\terror',
  );
  for (const video of VIDEOS) {
    const row = await probeOne(video.id, video.url, useFfprobe);
    console.log(
      [
        row.id,
        row.durationSeconds ?? '',
        row.seconds ?? '',
        row.timescale ?? '',
        row.durationTicks ?? '',
        row.method,
        row.contentLength ?? '',
        row.error ?? '',
      ].join('\t'),
    );
  }
}

void main();
