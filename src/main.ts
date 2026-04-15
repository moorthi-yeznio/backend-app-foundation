import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { TenantContextMiddleware } from './rbac/middleware/tenant-context.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionsFilter());
  const correlationIdMiddleware = new CorrelationIdMiddleware();
  const tenantContextMiddleware = new TenantContextMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    correlationIdMiddleware.use(req, res, next),
  );
  app.use((req: Request, res: Response, next: NextFunction) =>
    tenantContextMiddleware.use(req, res, next),
  );
  const config = app.get(ConfigService);

  // ── Security headers ──────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────
  const origins = config.get<string[]>('cors.origins');
  app.enableCors({
    origin: origins,
    credentials: config.get<boolean>('cors.credentials'),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // ── API versioning ─────────────────────────────────────────────────
  const prefix = config.get<string>('app.prefix') ?? 'api';
  const version = config.get<string>('app.version') ?? 'v1';
  app.setGlobalPrefix(`${prefix}/${version}`);

  // ── Global validation pipe ────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger (non-production only) ─────────────────────────────────
  const isProduction = config.get<boolean>('app.isProduction');
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Backend API')
      .setDescription('Backend App Foundation API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      jsonDocumentUrl: `${prefix}/docs-json`,
    });
  }

  // ── Start ─────────────────────────────────────────────────────────
  const port = config.get<number>('app.port') ?? 3000;
  const logger = app.get(Logger);
  await app.listen(port);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
}

void bootstrap();
