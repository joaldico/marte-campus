import { apiJson } from './client'

export type PlayerRange = {
  from: number
  to: number
}

export type PlayerSiblings = {
  previousId: string | null
  nextId: string | null
}

export type PlayerChapter = {
  id: string
  videoId: string
  title: string
  position: number
  url: string
  ranges: PlayerRange[]
  cursor: number
  siblings: PlayerSiblings
}

export function getPlayerChapter(chapterId: string): Promise<PlayerChapter> {
  return apiJson<PlayerChapter>(
    `/api/player/chapters/${encodeURIComponent(chapterId)}`,
  )
}

export function playerVideoSrc(url: string): string {
  if (url.startsWith('/videos/')) {
    return `/api${url}`
  }
  return url
}
