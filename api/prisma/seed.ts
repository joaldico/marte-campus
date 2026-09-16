/**
 * Seed stub (T-1.6). Full Prisma inserts are T-3.2.
 * durationSeconds measured 2026-09-16 from ISO BMFF mvhd (ffprobe not installed).
 * Integer rule: Math.round(mvhd.duration / mvhd.timescale). See DECISIONS.md.
 */
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

function printVideos(): void {
  for (const video of VIDEO_DURATIONS) {
    console.log(
      JSON.stringify({ id: video.id, url: video.url, durationSeconds: video.durationSeconds }),
    );
  }
}

if (require.main === module) {
  printVideos();
}
