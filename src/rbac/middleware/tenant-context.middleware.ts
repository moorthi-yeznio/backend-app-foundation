import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(
    req: Request & { user?: { tenantId?: string }; tenantId?: string },
    _res: Response,
    next: NextFunction,
  ): void {
    const tenantId =
      req.user?.tenantId ?? (req.headers['x-tenant-id'] as string | undefined);
    req.tenantId = tenantId;
    next();
  }
}
