export type IngestInput = {
  userId: string;
  videoId: string;
  from: number;
  to: number;
  rate: number;
  at: Date;
};

export type IngestContext = {
  videoIds: ReadonlySet<string>;
  userIds: ReadonlySet<string>;
};

export type RejectReason =
  | 'inverted_interval'
  | 'unknown_video'
  | 'unknown_user'
  | 'negative_or_nan'
  | 'rate_not_positive';

export type IngestResult =
  | { accepted: true }
  | { accepted: false; reason: RejectReason };

export function ingest(input: IngestInput, ctx: IngestContext): IngestResult {
  if (!ctx.userIds.has(input.userId)) {
    return { accepted: false, reason: 'unknown_user' };
  }
  if (!ctx.videoIds.has(input.videoId)) {
    return { accepted: false, reason: 'unknown_video' };
  }
  if (
    Number.isNaN(input.from) ||
    Number.isNaN(input.to) ||
    Number.isNaN(input.rate) ||
    input.from < 0 ||
    input.to < 0
  ) {
    return { accepted: false, reason: 'negative_or_nan' };
  }
  if (input.from >= input.to) {
    return { accepted: false, reason: 'inverted_interval' };
  }
  if (input.rate <= 0) {
    return { accepted: false, reason: 'rate_not_positive' };
  }
  return { accepted: true };
}
