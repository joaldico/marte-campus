import { apiFetch, apiJson } from './client'
import type { PlayerRange } from './player'

export type PlaybackEventBody = {
  videoId: string
  from: number
  to: number
  rate: number
}

export type PlaybackEventResponse = {
  accepted: boolean
  ranges: PlayerRange[]
  cursor: number
}

export function postPlaybackEvent(
  body: PlaybackEventBody,
): Promise<PlaybackEventResponse> {
  return apiJson<PlaybackEventResponse>('/api/playback/events', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function flushPlaybackEventKeepalive(body: PlaybackEventBody): void {
  void apiFetch('/api/playback/events', {
    method: 'POST',
    body: JSON.stringify(body),
    keepalive: true,
  })
}
