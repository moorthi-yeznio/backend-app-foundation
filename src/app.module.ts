import { randomUUID } from 'crypto';
import { IncomingMessage } from 'http';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validationSchema } from './config/validation.schema';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import corsConfig from './config/cors.config';
import throttlerConfig from './config/throttler.config';
import { PrismaModule } from './database/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { HealthModule } from './health/health.module';

type RequestWithId = IncomingMessage & { id?: unknown };

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      load: [appConfig, databaseConfig, jwtConfig, corsConfig, throttlerConfig],
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
          limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    RbacModule,
    HealthModule,
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          transport:
            process.env['NODE_ENV'] !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          level: process.env['LOG_LEVEL'] ?? 'info',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.body.password',
              'req.body.refreshToken',
            ],
            censor: '[REDACTED]',
          },

          genReqId: (req: RequestWithId): string =>
            typeof req.id === 'string'
              ? req.id
              : typeof req.id === 'number'
                ? String(req.id)
                : randomUUID(),
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
