import { NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { createReadStream, statSync } from 'fs';

/**
 * Stream a file to the client with HTTP Range support. Range is what makes
 * <video> seeking work, and createReadStream guarantees the file is never
 * buffered into application memory — the key constraint for 1 GB RAM.
 */
export function streamFile(
  filePath: string,
  req: Request,
  res: Response,
  opts: { contentType?: string; downloadAs?: string } = {},
): void {
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    throw new NotFoundException('File not available yet.');
  }

  const contentType = opts.contentType ?? 'video/mp4';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  if (opts.downloadAs) {
    res.setHeader('Content-Disposition', `attachment; filename="${opts.downloadAs}"`);
  }

  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : size - 1;
    if (start >= size || end >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', size);
    createReadStream(filePath).pipe(res);
  }
}
