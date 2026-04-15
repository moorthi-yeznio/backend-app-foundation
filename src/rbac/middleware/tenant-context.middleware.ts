import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeTenantId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return UUID_V4_REGEX.test(trimmed) ? trimmed : undefined;
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(
    req: Request & { user?: { tenantId?: string }; tenantId?: string },
    _res: Response,
    next: NextFunction,
  ): void {
    // For authenticated requests, tenant context must come from trusted auth claims.
    const trustedTenantId = sanitizeTenantId(req.user?.tenantId);
    const headerTenantId = sanitizeTenantId(
      Array.isArray(req.headers['x-tenant-id'])
        ? req.headers['x-tenant-id'][0]
        : req.headers['x-tenant-id'],
    );
    const tenantId = req.user ? trustedTenantId : headerTenantId;
    req.tenantId = tenantId;
    next();
  }
}
