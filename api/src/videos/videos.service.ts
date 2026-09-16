import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { videoProxyEnabled } from './video-proxy';

const FORWARD_HEADERS = [
  'accept-ranges',
  'content-range',
  'content-type',
  'content-length',
] as const;

@Injectable()
export class VideosService {
  constructor(private readonly prisma: PrismaService) {}

  async stream(
    id: string,
    rangeHeader: string | undefined,
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

    const originRes = await fetch(video.url, {
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
    });

    res.status(originRes.status);
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

    await pipeline(
      Readable.fromWeb(originRes.body as import('stream/web').ReadableStream),
      res,
    );
  }
}
