import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

const MAX_REQUEST_ID_LENGTH = 64;
const SAFE_REQUEST_ID_REGEX = /^[A-Za-z0-9_-]+$/;

function sanitizeRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_REQUEST_ID_LENGTH) {
    return undefined;
  }

  return SAFE_REQUEST_ID_REGEX.test(trimmed) ? trimmed : undefined;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(
    req: Request & { id?: unknown },
    res: Response,
    next: NextFunction,
  ): void {
    const headerValue = Array.isArray(req.headers['x-request-id'])
      ? req.headers['x-request-id'][0]
      : req.headers['x-request-id'];
    const id = sanitizeRequestId(headerValue) ?? randomUUID();
    req.id = id;
    res.setHeader('X-Request-ID', id);
    next();
  }
}
