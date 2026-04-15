# Backend Foundation — Phase 1: Core Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the blocking foundation layer — environment config, Supabase/Prisma database, security hardening, request validation, and Swagger docs — so every subsequent phase has a stable base to build on.

**Architecture:** Config layer first (validates env at boot) → Prisma global module (DB access everywhere) → Security middleware in `main.ts` (Helmet, CORS, rate limiting) → Global `ValidationPipe` → Swagger wired last so it reflects decorated DTOs.

**Tech Stack:** NestJS 11, `@nestjs/config` + Joi, Prisma 6, Supabase Postgres, Helmet, `@nestjs/throttler`, `class-validator`, `class-transformer`, `@nestjs/swagger`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `.env` | Create | Local secrets (gitignored) |
| `.env.example` | Create | Documented env contract |
| `src/config/validation.schema.ts` | Create | Joi schema — validates all env vars at boot |
| `src/config/app.config.ts` | Create | App namespace: port, env, prefix, version |
| `src/config/database.config.ts` | Create | DB namespace: connection URL |
| `src/config/jwt.config.ts` | Create | JWT namespace: secrets, expiry |
| `src/config/cors.config.ts` | Create | CORS namespace: origins, credentials |
| `src/config/throttler.config.ts` | Create | Rate-limit namespace: ttl, limit |
| `src/database/prisma.service.ts` | Create | `PrismaClient` extended as injectable service |
| `src/database/prisma.module.ts` | Create | Global NestJS module exporting `PrismaService` |
| `prisma/schema.prisma` | Create | DB schema: users, tenants, members, RBAC, tokens |
| `src/app.module.ts` | Modify | Wire ConfigModule + PrismaModule |
| `src/main.ts` | Modify | Bootstrap: Helmet, CORS, throttler, versioning, Swagger, pipe |

---

## Task 1: Install Dependencies

**Files:** `package.json` (modified by pnpm)

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /Users/moorthikanthasamy/Workspace/backend-app-foundation
pnpm add @nestjs/config joi @nestjs/throttler helmet @nestjs/swagger swagger-ui-express class-validator class-transformer @prisma/client
```

Expected: All packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Install Prisma CLI as dev dependency**

```bash
pnpm add -D prisma
```

Expected: `prisma` added to `devDependencies`.

- [ ] **Step 3: Verify install**

```bash
pnpm list @nestjs/config joi prisma @prisma/client helmet @nestjs/throttler @nestjs/swagger class-validator class-transformer
```

Expected: All packages listed with version numbers, no errors.

---

## Task 2: Environment Files

**Files:**
- Create: `.env`
- Create: `.env.example`

- [ ] **Step 1: Create `.env` with local development values**

```dotenv
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api
API_VERSION=v1

# Database (replace with your Supabase transaction pooler URL)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_REFRESH_EXPIRES_IN=7d

# CORS (comma-separated)
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Logging
LOG_LEVEL=debug

# Rate Limiting
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
```

- [ ] **Step 2: Create `.env.example` (committed to git)**

```dotenv
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api
API_VERSION=v1

# Database — use Supabase transaction pooler URL for DIRECT_URL use session pooler or direct connection
DATABASE_URL=postgresql://USER:PASSWORD@HOST:6543/DATABASE?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE

# JWT — generate with: openssl rand -hex 64
JWT_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=7d

# CORS — comma-separated list of allowed origins
CORS_ORIGINS=http://localhost:3000

# Logging — fatal | error | warn | info | debug | trace
LOG_LEVEL=info

# Rate Limiting — TTL in milliseconds, limit = max requests per TTL window
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
```

- [ ] **Step 3: Ensure `.env` is gitignored**

Check `.gitignore` contains `.env` (not `.env.example`). If missing:

```bash
echo ".env" >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add env example and gitignore"
```

---

## Task 3: Config Namespaces

**Files:**
- Create: `src/config/validation.schema.ts`
- Create: `src/config/app.config.ts`
- Create: `src/config/database.config.ts`
- Create: `src/config/jwt.config.ts`
- Create: `src/config/cors.config.ts`
- Create: `src/config/throttler.config.ts`

- [ ] **Step 1: Create Joi validation schema**

`src/config/validation.schema.ts`:
```typescript
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),

  DATABASE_URL: Joi.string().uri().required(),
  DIRECT_URL: Joi.string().uri().optional(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),
});
```

- [ ] **Step 2: Create app config namespace**

`src/config/app.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  prefix: process.env.API_PREFIX ?? 'api',
  version: process.env.API_VERSION ?? 'v1',
  isProduction: process.env.NODE_ENV === 'production',
}));
```

- [ ] **Step 3: Create database config namespace**

`src/config/database.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
}));
```

- [ ] **Step 4: Create JWT config namespace**

`src/config/jwt.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
```

- [ ] **Step 5: Create CORS config namespace**

`src/config/cors.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('cors', () => ({
  origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
  credentials: true,
}));
```

- [ ] **Step 6: Create throttler config namespace**

`src/config/throttler.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('throttler', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
}));
```

- [ ] **Step 7: Commit**

```bash
git add src/config/
git commit -m "feat: add config namespaces with Joi validation"
```

---

## Task 4: Wire ConfigModule into AppModule

**Files:**
- Modify: `src/app.module.ts`

- [ ] **Step 1: Update AppModule to load ConfigModule**

`src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validationSchema } from './config/validation.schema';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import corsConfig from './config/cors.config';
import throttlerConfig from './config/throttler.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      load: [appConfig, databaseConfig, jwtConfig, corsConfig, throttlerConfig],
      validationOptions: {
        allowUnknown: false,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 2: Verify app starts without errors**

```bash
pnpm start:dev
```

Expected output: `[NestApplication] Nest application successfully started` on port 3000. If `.env` is missing required vars, it should throw a validation error.

- [ ] **Step 3: Commit**

```bash
git add src/app.module.ts
git commit -m "feat: wire ConfigModule and ThrottlerModule into AppModule"
```

---

## Task 5: Prisma Setup and Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Initialise Prisma**

```bash
pnpm exec prisma init --datasource-provider postgresql
```

Expected: Creates `prisma/schema.prisma` and updates `.env` with a `DATABASE_URL` placeholder. Since we already have `.env`, verify the existing `DATABASE_URL` is intact.

- [ ] **Step 2: Replace schema.prisma with full foundation schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String
  firstName     String?
  lastName      String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  deletedAt     DateTime?
  tenantMembers TenantMember[]
  refreshTokens RefreshToken[]

  @@map("users")
}

model Tenant {
  id        String         @id @default(uuid())
  name      String
  slug      String         @unique
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  deletedAt DateTime?
  members   TenantMember[]

  @@map("tenants")
}

model TenantMember {
  id        String             @id @default(uuid())
  userId    String
  tenantId  String
  createdAt DateTime           @default(now())
  user      User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant    Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  roles     TenantMemberRole[]

  @@unique([userId, tenantId])
  @@map("tenant_members")
}

model Role {
  id          String             @id @default(uuid())
  name        String             @unique
  description String?
  permissions RolePermission[]
  memberRoles TenantMemberRole[]

  @@map("roles")
}

model Permission {
  id          String           @id @default(uuid())
  action      String           @unique
  description String?
  roles       RolePermission[]

  @@map("permissions")
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model TenantMemberRole {
  memberId String
  roleId   String
  member   TenantMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  role     Role         @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([memberId, roleId])
  @@map("tenant_member_roles")
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  createdAt DateTime  @default(now())
  revokedAt DateTime?
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}
```

- [ ] **Step 3: Run first migration**

```bash
pnpm exec prisma migrate dev --name init
```

Expected: Creates `prisma/migrations/[timestamp]_init/migration.sql` and applies it to your Supabase database.

- [ ] **Step 4: Generate Prisma client**

```bash
pnpm exec prisma generate
```

Expected: `Generated Prisma Client` message. Client files appear in `node_modules/@prisma/client`.

- [ ] **Step 5: Add prisma scripts to package.json**

In `package.json`, add to `scripts`:
```json
"db:migrate": "prisma migrate dev",
"db:migrate:deploy": "prisma migrate deploy",
"db:studio": "prisma studio",
"db:generate": "prisma generate",
"db:seed": "prisma db seed"
```

- [ ] **Step 6: Commit**

```bash
git add prisma/ package.json
git commit -m "feat: add Prisma schema with users, tenants, RBAC, and refresh tokens"
```

---

## Task 6: PrismaService and PrismaModule

**Files:**
- Create: `src/database/prisma.service.ts`
- Create: `src/database/prisma.module.ts`

- [ ] **Step 1: Write failing unit test for PrismaService**

`src/database/prisma.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose $connect method', () => {
    expect(typeof service.$connect).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/database/prisma.service.spec.ts
```

Expected: FAIL — `Cannot find module './prisma.service'`

- [ ] **Step 3: Implement PrismaService**

`src/database/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/database/prisma.service.spec.ts
```

Expected: PASS — 2 tests pass

- [ ] **Step 5: Create PrismaModule**

`src/database/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 6: Register PrismaModule in AppModule**

In `src/app.module.ts`, add `PrismaModule` to imports:

```typescript
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ ... }),
    ThrottlerModule.forRootAsync({ ... }),
    PrismaModule,
  ],
  ...
})
export class AppModule {}
```

- [ ] **Step 7: Commit**

```bash
git add src/database/
git commit -m "feat: add PrismaService and global PrismaModule"
```

---

## Task 7: Security Hardening in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update main.ts with all security middleware**

`src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // ── Security headers ──────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────
  const origins = config.get<string>('cors.origins');
  app.enableCors({
    origin: origins,
    credentials: config.get<boolean>('cors.credentials'),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // ── API versioning ─────────────────────────────────────────────────
  const prefix = config.get<string>('app.prefix') ?? 'api';
  const version = config.get<string>('app.version') ?? 'v1';
  app.setGlobalPrefix(prefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: version,
  });

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
  await app.listen(port);
}

bootstrap();
```

- [ ] **Step 2: Start the app and verify all layers are active**

```bash
pnpm start:dev
```

Expected:
- No startup errors
- `GET /api/docs` returns Swagger UI (200)
- `GET /api/docs-json` returns OpenAPI JSON (200)
- `GET /api/v1` returns `Hello World!` (200)
- Response headers include `x-frame-options`, `x-content-type-options` (Helmet)

Test with curl:
```bash
curl -I http://localhost:3000/api/v1
```

Expected headers: `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`

- [ ] **Step 3: Test rate limiting**

```bash
for i in {1..5}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1; done
```

Expected: All 200. To test the limit, temporarily set `THROTTLE_LIMIT=2` in `.env` and restart — third request should return 429.

- [ ] **Step 4: Test validation pipe**

Since there are no DTOs yet, just confirm app starts with no errors. Validation pipe enforcement will be tested in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: add Helmet, CORS, versioning, ValidationPipe, and Swagger to bootstrap"
```

---

## Task 8: Request Validation — Base DTO Conventions

**Files:**
- Create: `src/common/dto/pagination.dto.ts`
- Create: `src/common/dto/id-param.dto.ts`

- [ ] **Step 1: Write failing tests for DTOs**

`src/common/dto/pagination.dto.spec.ts`:
```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  it('uses defaults when no values provided', async () => {
    const dto = plainToInstance(PaginationDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('rejects negative page', async () => {
    const dto = plainToInstance(PaginationDto, { page: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects limit over 100', async () => {
    const dto = plainToInstance(PaginationDto, { limit: 200 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/common/dto/pagination.dto.spec.ts
```

Expected: FAIL — `Cannot find module './pagination.dto'`

- [ ] **Step 3: Implement PaginationDto**

`src/common/dto/pagination.dto.ts`:
```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
```

- [ ] **Step 4: Create IdParamDto**

`src/common/dto/id-param.dto.ts`:
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(4)
  id!: string;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test src/common/dto/pagination.dto.spec.ts
```

Expected: PASS — 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/common/
git commit -m "feat: add base DTOs (PaginationDto, IdParamDto) with class-validator"
```

---

## Task 9: Swagger Decorator Conventions

**Files:**
- Create: `src/common/decorators/api-paginated-response.decorator.ts`

- [ ] **Step 1: Create paginated response decorator**

`src/common/decorators/api-paginated-response.decorator.ts`:
```typescript
import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

export class PaginatedDto<T> {
  data!: T[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;
}

export const ApiPaginatedResponse = <T extends Type>(model: T) =>
  applyDecorators(
    ApiExtraModels(PaginatedDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
```

- [ ] **Step 2: Verify Swagger UI still loads**

```bash
pnpm start:dev
```

Open `http://localhost:3000/api/docs` — Swagger UI should load with no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/common/decorators/
git commit -m "feat: add ApiPaginatedResponse Swagger decorator"
```

---

## Task 10: AppController Update + E2E Verification

**Files:**
- Modify: `src/app.controller.ts`
- Modify: `test/app.e2e-spec.ts`

- [ ] **Step 1: Update AppController to reflect versioned prefix**

`src/app.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Health ping' })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

- [ ] **Step 2: Update E2E test for versioned URL**

`test/app.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: 'v1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
pnpm test:e2e
```

Expected: PASS — 1 test passes

- [ ] **Step 4: Run all unit tests**

```bash
pnpm test
```

Expected: All unit tests pass.

- [ ] **Step 5: Final commit for Phase 1**

```bash
git add src/app.controller.ts test/app.e2e-spec.ts
git commit -m "feat: update AppController with Swagger tags, fix E2E for versioned routes"
```

---

## Phase 1 Verification Checklist

Run through these manually after all tasks complete:

1. `pnpm start:dev` — starts cleanly, no env errors
2. `curl http://localhost:3000/api/v1` — returns `Hello World!`
3. `curl -I http://localhost:3000/api/v1` — response has `x-frame-options` and `x-content-type-options` headers
4. `http://localhost:3000/api/docs` in browser — Swagger UI loads with Bearer auth button and `App` tag
5. `http://localhost:3000/api/docs-json` — returns valid OpenAPI JSON
6. Start app with `DATABASE_URL` removed from `.env` — should throw Joi validation error at boot
7. `pnpm test` — all unit tests pass
8. `pnpm test:e2e` — E2E test passes
9. `pnpm exec prisma studio` — opens Prisma Studio showing all 7 tables

---

## Next: Phase 2

After Phase 1 is complete, implement Phase 2 (Authentication + Multi-Tenant RBAC) using plan `2026-04-14-backend-foundation-phase2.md`.
