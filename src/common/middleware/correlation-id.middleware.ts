import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const id = (req.headers['x-request-id'] as string) ?? randomUUID();
    req.id = id;
    res.setHeader('X-Request-ID', id);
    next();
  }
}
