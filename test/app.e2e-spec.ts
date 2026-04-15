import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { NextFunction, Request, Response as ExpressResponse } from 'express';
import request, { Response } from 'supertest';
import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { CorrelationIdMiddleware } from '../src/common/middleware/correlation-id.middleware';
import { TenantContextMiddleware } from '../src/rbac/middleware/tenant-context.middleware';

describe('Application (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: 'v1',
      prefix: false,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    const correlationIdMiddleware = new CorrelationIdMiddleware();
    const tenantContextMiddleware = new TenantContextMiddleware();
    app.use((req: Request, res: ExpressResponse, next: NextFunction) =>
      correlationIdMiddleware.use(req, res, next),
    );
    app.use((req: Request, res: ExpressResponse, next: NextFunction) =>
      tenantContextMiddleware.use(req, res, next),
    );

    await app.init();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1 (GET)', () => {
    return request(httpServer)
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/v1/health/live (GET)', async () => {
    const response: Response = await request(httpServer)
      .get('/api/v1/health/live')
      .expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('returns standard error envelope for unknown routes', async () => {
    const response: Response = await request(httpServer)
      .get('/api/v1/does-not-exist')
      .expect(404);
    const body = response.body as Record<string, unknown>;
    expect(body['statusCode']).toBe(404);
    expect(body['path']).toBe('/api/v1/does-not-exist');
    expect(typeof body['timestamp']).toBe('string');
    expect(typeof body['requestId']).toBe('string');
  });
});
