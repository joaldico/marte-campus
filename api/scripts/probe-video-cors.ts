/**
 * Spike T-1.5: probe archive.org video CORS for spec 2.2.2.
 * Run from api/: npx ts-node --transpile-only scripts/probe-video-cors.ts
 */
const ORIGIN = 'http://localhost';

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

type ProbeRow = {
  id: string;
  method: 'HEAD' | 'GET';
  status: number | null;
  accessControlAllowOrigin: string | null;
  acceptRanges: string | null;
  contentRange: string | null;
  contentType: string | null;
  finalUrl: string | null;
  error: string | null;
};

function header(res: Response, name: string): string | null {
  return res.headers.get(name);
}

async function probe(id: string, url: string, method: 'HEAD' | 'GET'): Promise<ProbeRow> {
  const headers: Record<string, string> = {
    Origin: ORIGIN,
    'User-Agent': 'MarteCampus-CORS-Probe/1.0',
    Accept: '*/*',
  };
  if (method === 'GET') {
    headers.Range = 'bytes=0-1';
  }

  try {
    const res = await fetch(url, { method, headers, redirect: 'follow' });
    return {
      id,
      method,
      status: res.status,
      accessControlAllowOrigin: header(res, 'access-control-allow-origin'),
      acceptRanges: header(res, 'accept-ranges'),
      contentRange: header(res, 'content-range'),
      contentType: header(res, 'content-type'),
      finalUrl: res.url,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id,
      method,
      status: null,
      accessControlAllowOrigin: null,
      acceptRanges: null,
      contentRange: null,
      contentType: null,
      finalUrl: null,
      error: message,
    };
  }
}

function allowsBrowserOrigin(acao: string | null): boolean {
  if (acao === null) {
    return false;
  }
  const value = acao.trim();
  return value === '*' || value === ORIGIN;
}

async function main(): Promise<void> {
  const rows: ProbeRow[] = [];
  for (const video of VIDEOS) {
    rows.push(await probe(video.id, video.url, 'HEAD'));
    rows.push(await probe(video.id, video.url, 'GET'));
  }

  console.log(`Origin: ${ORIGIN}`);
  console.log(
    'id\tmethod\tstatus\taccess-control-allow-origin\taccept-ranges\tcontent-range\tcontent-type\tfinalUrl\terror',
  );
  for (const row of rows) {
    console.log(
      [
        row.id,
        row.method,
        row.status ?? '',
        row.accessControlAllowOrigin ?? '(none)',
        row.acceptRanges ?? '(none)',
        row.contentRange ?? '(none)',
        row.contentType ?? '(none)',
        row.finalUrl ?? '',
        row.error ?? '',
      ].join('\t'),
    );
  }

  const corsOk = rows.every((row) => row.error === null && allowsBrowserOrigin(row.accessControlAllowOrigin));
  console.log('');
  console.log(`CORS_OK=${corsOk}`);
  console.log(`VIDEO_PROXY_DEFAULT=${!corsOk}`);
}

void main();
