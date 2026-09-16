export function videoProxyEnabled(): boolean {
  return process.env.VIDEO_PROXY === 'true';
}

export function playerVideoUrl(videoId: string, originUrl: string): string {
  return videoProxyEnabled() ? `/videos/${videoId}/stream` : originUrl;
}
