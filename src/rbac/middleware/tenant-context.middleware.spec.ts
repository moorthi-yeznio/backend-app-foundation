import { NextFunction, Request, Response } from 'express';
import { TenantContextMiddleware } from './tenant-context.middleware';

describe('TenantContextMiddleware', () => {
  let middleware: TenantContextMiddleware;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    middleware = new TenantContextMiddleware();
    next = jest.fn();
  });

  it('uses authenticated user tenant id when present', () => {
    const req = {
      user: { tenantId: '123e4567-e89b-42d3-a456-426614174000' },
      headers: { 'x-tenant-id': '123e4567-e89b-42d3-a456-426614174999' },
    } as unknown as Request & {
      user?: { tenantId?: string };
      tenantId?: string;
    };

    middleware.use(req, {} as Response, next);

    expect(req.tenantId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(next).toHaveBeenCalled();
  });

  it('does not trust header tenant id for authenticated user without tenant claim', () => {
    const req = {
      user: {},
      headers: { 'x-tenant-id': '123e4567-e89b-42d3-a456-426614174999' },
    } as unknown as Request & {
      user?: { tenantId?: string };
      tenantId?: string;
    };

    middleware.use(req, {} as Response, next);

    expect(req.tenantId).toBeUndefined();
  });

  it('allows valid tenant header only for unauthenticated requests', () => {
    const req = {
      headers: { 'x-tenant-id': '123e4567-e89b-42d3-a456-426614174999' },
    } as unknown as Request & {
      user?: { tenantId?: string };
      tenantId?: string;
    };

    middleware.use(req, {} as Response, next);

    expect(req.tenantId).toBe('123e4567-e89b-42d3-a456-426614174999');
  });

  it('drops invalid tenant header', () => {
    const req = {
      headers: { 'x-tenant-id': 'tenant-a' },
    } as unknown as Request & {
      user?: { tenantId?: string };
      tenantId?: string;
    };

    middleware.use(req, {} as Response, next);

    expect(req.tenantId).toBeUndefined();
  });
});
