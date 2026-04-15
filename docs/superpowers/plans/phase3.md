# Backend Foundation — Phase 3: Observability & Resilience

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade structured logging (Pino with correlation IDs + field redaction), a global exception filter with a standardised error envelope and Prisma error mapping, and health-check endpoints for Kubernetes liveness/readiness probes.

**Architecture:** Logging first (every subsequent layer gets traced) → Error filter second (wraps all exceptions into consistent shape) → Health checks last (lightweight endpoints that verify DB + memory).

**Tech Stack:** `nestjs-pino`, `pino-http`, `pino-pretty` (dev), `@nestjs/terminus`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/common/middleware/correlation-id.middleware.ts` | Create | Generates `X-Request-ID` UUID if absent, attaches to request + response |
| `src/common/filters/all-exceptions.filter.ts` | Create | Global exception filter — catches everything, maps to standard envelope |
| `src/common/filters/all-exceptions.filter.spec.ts` | Create | Unit tests for the filter |
| `src/health/health.module.ts` | Create | Terminus health module |
| `src/health/health.controller.ts` | Create | `/health`, `/health/live`, `/health/ready` endpoints |
| `src/app.module.ts` | Modify | Register LoggerModule, HealthModule, apply CorrelationIdMiddleware, global filter |
| `src/main.ts` | Modify | Use Pino logger, apply global filter |

---

## Task 1: Install Phase 3 Dependencies

**Files:** `package.json`

- [ ] **Step 1: Install runtime packages**

```bash
pnpm add nestjs-pino pino-http @nestjs/terminus
```

- [ ] **Step 2: Install dev packages**

```bash
pnpm add -D pino-pretty
```

- [ ] **Step 3: Verify**

```bash
pnpm list nestjs-pino pino-http @nestjs/terminus pino-pretty 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install Phase 3 dependencies (nestjs-pino, terminus)"
```

---

## Task 2: Correlation ID Middleware

**Files:**
- Create: `src/common/middleware/correlation-id.middleware.ts`

- [ ] **Step 1: Create middleware**

`src/common/middleware/correlation-id.middleware.ts`:
```typescript
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
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add src/common/middleware/
git commit -m "feat: add CorrelationIdMiddleware for X-Request-ID propagation"
```

---

## Task 3: Wire Pino Logger into AppModule and main.ts

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Read both files before modifying**

Read `src/app.module.ts` and `src/main.ts`.

- [ ] **Step 2: Add LoggerModule to AppModule imports**

Add this import at the top of `src/app.module.ts`:
```typescript
import { LoggerModule } from 'nestjs-pino';
```

Add `LoggerModule` to the imports array (after `RbacModule`):
```typescript
LoggerModule.forRootAsync({
  useFactory: () => ({
    pinoHttp: {
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      level: process.env['LOG_LEVEL'] ?? 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
        censor: '[REDACTED]',
      },
      genReqId: (req: { id?: string }) => req.id,
    },
  }),
}),
```

Also add the `CorrelationIdMiddleware` application. In the `AppModule` class body, implement `NestModule`:
```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
```

Make `AppModule` implement `NestModule` and add `configure`:
```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
```

Import `RequestMethod` from `@nestjs/common`.

- [ ] **Step 3: Update main.ts to use Pino logger**

In `src/main.ts`, add after creating the app:
```typescript
import { Logger } from 'nestjs-pino';
```

After `const app = await NestFactory.create(AppModule)`, add:
```typescript
app.useLogger(app.get(Logger));
```

Also update the final `app.listen` line to log the port using the Pino logger:
```typescript
const logger = app.get(Logger);
await app.listen(port);
logger.log(`Application running on port ${port}`, 'Bootstrap');
```

- [ ] **Step 4: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 5: Run tests**

```bash
pnpm test --no-coverage 2>&1
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app.module.ts src/main.ts src/common/
git commit -m "feat: add nestjs-pino structured logging with correlation IDs and field redaction"
```

---

## Task 4: Global Exception Filter (TDD)

**Files:**
- Create: `src/common/filters/all-exceptions.filter.spec.ts`
- Create: `src/common/filters/all-exceptions.filter.ts`

- [ ] **Step 1: Write failing tests**

`src/common/filters/all-exceptions.filter.spec.ts`:
```typescript
import { AllExceptionsFilter } from './all-exceptions.filter';
import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
const mockGetRequest = jest.fn().mockReturnValue({ url: '/test', method: 'GET', id: 'req-123' });

const mockHost = {
  switchToHttp: () => ({
    getResponse: mockGetResponse,
    getRequest: mockGetRequest,
  }),
} as unknown as ArgumentsHost;

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('maps HttpException to correct status and message', () => {
    const exception = new NotFoundException('Resource not found');
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Resource not found',
        requestId: 'req-123',
      }),
    );
  });

  it('maps unknown errors to 500', () => {
    const exception = new Error('Something exploded');
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    );
  });

  it('includes timestamp in response', () => {
    filter.catch(new HttpException('test', 400), mockHost);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm test src/common/filters/all-exceptions.filter.spec.ts --no-coverage 2>&1
```

Expected: FAIL — `Cannot find module './all-exceptions.filter'`

- [ ] **Step 3: Implement AllExceptionsFilter**

`src/common/filters/all-exceptions.filter.ts`:
```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface PrismaError {
  code?: string;
  meta?: Record<string, unknown>;
}

function isPrismaError(err: unknown): err is PrismaError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as PrismaError).code === 'string' &&
    (err as PrismaError).code!.startsWith('P')
  );
}

function prismaStatusCode(code: string): HttpStatus {
  switch (code) {
    case 'P2002':
      return HttpStatus.CONFLICT;           // Unique constraint violation
    case 'P2025':
      return HttpStatus.NOT_FOUND;          // Record not found
    case 'P2003':
      return HttpStatus.BAD_REQUEST;        // Foreign key constraint violation
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

function prismaMessage(code: string): string {
  switch (code) {
    case 'P2002':
      return 'A record with this value already exists';
    case 'P2025':
      return 'The requested resource was not found';
    case 'P2003':
      return 'Related resource not found';
    default:
      return 'A database error occurred';
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const isProduction = process.env['NODE_ENV'] === 'production';

    let statusCode: HttpStatus;
    let message: string;
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (body as { message?: string }).message ?? exception.message;
      details = typeof body === 'object' ? body : undefined;
    } else if (isPrismaError(exception)) {
      statusCode = prismaStatusCode(exception.code!);
      message = prismaMessage(exception.code!);
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId: request.id },
        `Unhandled exception: ${message}`,
      );
    }

    const body: Record<string, unknown> = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.id,
    };

    if (!isProduction && statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      body['stack'] = exception instanceof Error ? exception.stack : undefined;
      if (details) body['details'] = details;
    } else if (statusCode < HttpStatus.INTERNAL_SERVER_ERROR && details) {
      body['details'] = details;
    }

    response.status(statusCode).json(body);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/common/filters/all-exceptions.filter.spec.ts --no-coverage 2>&1
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Register filter globally in main.ts**

In `src/main.ts`, add after `app.useLogger(...)`:
```typescript
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
```

```typescript
app.useGlobalFilters(new AllExceptionsFilter());
```

- [ ] **Step 6: Run all tests**

```bash
pnpm test --no-coverage 2>&1
```

Expected: All tests pass.

- [ ] **Step 7: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add src/common/filters/ src/main.ts
git commit -m "feat: add AllExceptionsFilter with Prisma error mapping and standard error envelope"
```

---

## Task 5: Health Checks

**Files:**
- Create: `src/health/health.module.ts`
- Create: `src/health/health.controller.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create HealthController**

`src/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check (DB + memory + disk)' })
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — is the process up?' })
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — is the DB reachable?' })
  readiness() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
    ]);
  }
}
```

- [ ] **Step 2: Create HealthModule**

`src/health/health.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 3: Register HealthModule in AppModule**

Read `src/app.module.ts` and add `HealthModule` to imports:

```typescript
import { HealthModule } from './health/health.module';
```

Add `HealthModule` at the end of the imports array.

- [ ] **Step 4: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 5: Run all tests**

```bash
pnpm test --no-coverage 2>&1
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/health/ src/app.module.ts
git commit -m "feat: add health checks (/health, /health/live, /health/ready) via @nestjs/terminus"
```

---

## Task 6: Phase 3 Integration Verification

- [ ] **Step 1: Run all tests**

```bash
pnpm test --no-coverage 2>&1
```

- [ ] **Step 2: Run E2E tests**

```bash
pnpm test:e2e 2>&1
```

- [ ] **Step 3: Boot the app and verify all Phase 3 features**

```bash
PORT=3003 pnpm start:dev &
APP_PID=$!
sleep 9

echo "=== Liveness probe ==="
curl -s http://localhost:3003/api/v1/health/live

echo ""
echo "=== Readiness probe ==="
curl -s http://localhost:3003/api/v1/health/ready | python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d.get('status'))"

echo ""
echo "=== Full health check ==="
curl -s http://localhost:3003/api/v1/health | python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d.get('status'))"

echo ""
echo "=== Error envelope (404) ==="
curl -s http://localhost:3003/api/v1/nonexistent | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d, indent=2))"

echo ""
echo "=== X-Request-ID header ==="
curl -s -I http://localhost:3003/api/v1 | grep -i "x-request-id"

kill $APP_PID 2>/dev/null || true
wait $APP_PID 2>/dev/null || true
```

Expected:
- Liveness: `{"status":"ok"}`
- Readiness: `status: ok`
- Full health: `status: ok`
- 404 error: JSON envelope with `statusCode`, `message`, `timestamp`, `requestId`
- `X-Request-ID` header present in response

- [ ] **Step 4: Report final commit log**

```bash
git log --oneline | head -8
```
