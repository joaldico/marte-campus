import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { videoProxyEnabled } from './video-proxy';

const FORWARD_HEADERS = ['content-range', 'content-type', 'content-length'] as const;
const DEFAULT_ORIGIN_FETCH_TIMEOUT_MS = 15_000;

export function originFetchTimeoutMs(): number {
  const raw = process.env.VIDEO_ORIGIN_TIMEOUT_MS;
  if (raw == null || raw === '') {
    return DEFAULT_ORIGIN_FETCH_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_ORIGIN_FETCH_TIMEOUT_MS;
}

function originFailed(): HttpException {
  return new HttpException(
    { code: 'VIDEO_ORIGIN_ERROR', message: 'Video origin request failed' },
    HttpStatus.BAD_GATEWAY,
  );
}

@Injectable()
export class VideosService {
  constructor(private readonly prisma: PrismaService) {}

  async stream(
    id: string,
    rangeHeader: string | undefined,
    req: Request,
    res: Response,
  ): Promise<void> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) {
      throw new HttpException(
        { code: 'VIDEO_NOT_FOUND', message: 'Unknown video' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!videoProxyEnabled()) {
      res.redirect(video.url);
      return;
    }

    const controller = new AbortController();
    let clientClosed = false;
    const onClose = () => {
      clientClosed = true;
      controller.abort();
    };
    req.on('close', onClose);
    const timeout = setTimeout(
      () => controller.abort(),
      originFetchTimeoutMs(),
    );

    try {
      let originRes: globalThis.Response;
      try {
        originRes = await fetch(video.url, {
          headers: rangeHeader ? { Range: rangeHeader } : undefined,
          signal: controller.signal,
        });
      } catch {
        if (clientClosed || req.destroyed) {
          return;
        }
        throw originFailed();
      }
      clearTimeout(timeout);

      res.status(originRes.status);
      res.setHeader('Accept-Ranges', 'bytes');
      for (const name of FORWARD_HEADERS) {
        const value = originRes.headers.get(name);
        if (value) {
          res.setHeader(name, value);
        }
      }

      if (!originRes.body) {
        res.end();
        return;
      }

      try {
        await pipeline(
          Readable.fromWeb(
            originRes.body as import('stream/web').ReadableStream,
          ),
          res,
        );
      } catch {
        if (res.headersSent) {
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        throw originFailed();
      }
    } finally {
      clearTimeout(timeout);
      req.off('close', onClose);
    }
  }
}
