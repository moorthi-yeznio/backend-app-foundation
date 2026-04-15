# Backend Foundation — Phase 2: Authentication & Multi-Tenant RBAC

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add custom JWT authentication (register/login/refresh/logout with argon2 + refresh token rotation) and multi-tenant RBAC (tenant-scoped roles, permission guards, and request context decorators).

**Architecture:** Auth layer first (password hashing → token issuance → global guard with `@Public()` escape hatch) → RBAC layer on top (tenant context middleware extracts tenant from JWT → role/permission guards enforce access). All guards are global by default.

**Tech Stack:** `@nestjs/jwt`, `argon2`, `@nestjs/passport`, `passport-jwt`, `passport`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/auth/auth.module.ts` | Create | Wires all auth providers, imports JwtModule |
| `src/auth/auth.controller.ts` | Create | POST /auth/register, /login, /refresh, /logout |
| `src/auth/auth.service.ts` | Create | Business logic: hash, verify, issue tokens, rotate refresh |
| `src/auth/auth.service.spec.ts` | Create | Unit tests for auth service |
| `src/auth/strategies/jwt.strategy.ts` | Create | Passport JWT strategy — validates access token |
| `src/auth/guards/jwt-auth.guard.ts` | Create | Global guard wrapping PassportAuthGuard |
| `src/auth/decorators/public.decorator.ts` | Create | `@Public()` metadata decorator to skip auth |
| `src/auth/decorators/current-user.decorator.ts` | Create | `@CurrentUser()` param decorator |
| `src/auth/dto/register.dto.ts` | Create | RegisterDto with email, password, firstName, lastName |
| `src/auth/dto/login.dto.ts` | Create | LoginDto with email, password |
| `src/auth/dto/refresh-token.dto.ts` | Create | RefreshTokenDto with refreshToken |
| `src/auth/dto/auth-response.dto.ts` | Create | AuthResponseDto: accessToken, refreshToken, user |
| `src/auth/types/jwt-payload.type.ts` | Create | JwtPayload interface: sub, email, tenantId |
| `src/rbac/rbac.module.ts` | Create | Wires RBAC guards and exports them |
| `src/rbac/guards/roles.guard.ts` | Create | Reads `@Roles()` metadata, checks tenant member roles |
| `src/rbac/guards/permissions.guard.ts` | Create | Reads `@Permissions()` metadata, checks role permissions |
| `src/rbac/decorators/roles.decorator.ts` | Create | `@Roles(...roles)` metadata decorator |
| `src/rbac/decorators/permissions.decorator.ts` | Create | `@Permissions(...perms)` metadata decorator |
| `src/rbac/decorators/current-tenant.decorator.ts` | Create | `@CurrentTenant()` param decorator |
| `src/rbac/middleware/tenant-context.middleware.ts` | Create | Extracts tenantId from JWT claim, attaches to request |
| `src/app.module.ts` | Modify | Register AuthModule, RbacModule, apply TenantContextMiddleware |

---

## Task 1: Install Auth Dependencies

**Files:** `package.json`

- [ ] **Step 1: Install runtime packages**

```bash
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt argon2
```

- [ ] **Step 2: Install type definitions**

```bash
pnpm add -D @types/passport-jwt @types/passport
```

- [ ] **Step 3: Verify**

```bash
pnpm list @nestjs/jwt @nestjs/passport passport passport-jwt argon2 2>&1 | head -20
```

Expected: All packages listed with version numbers.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install auth dependencies (jwt, passport, argon2)"
```

---

## Task 2: JWT Types and DTOs

**Files:**
- Create: `src/auth/types/jwt-payload.type.ts`
- Create: `src/auth/dto/register.dto.ts`
- Create: `src/auth/dto/login.dto.ts`
- Create: `src/auth/dto/refresh-token.dto.ts`
- Create: `src/auth/dto/auth-response.dto.ts`

- [ ] **Step 1: Create JwtPayload type**

`src/auth/types/jwt-payload.type.ts`:
```typescript
export interface JwtPayload {
  sub: string;        // user.id
  email: string;
  tenantId?: string;  // active tenant (optional — set after tenant selection)
}
```

- [ ] **Step 2: Create RegisterDto**

`src/auth/dto/register.dto.ts`:
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
}
```

- [ ] **Step 3: Create LoginDto**

`src/auth/dto/login.dto.ts`:
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}
```

- [ ] **Step 4: Create RefreshTokenDto**

`src/auth/dto/refresh-token.dto.ts`:
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
```

- [ ] **Step 5: Create AuthResponseDto**

`src/auth/dto/auth-response.dto.ts`:
```typescript
import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ required: false }) firstName?: string;
  @ApiProperty({ required: false }) lastName?: string;
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}
```

- [ ] **Step 6: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/auth/
git commit -m "feat: add JWT payload type and auth DTOs"
```

---

## Task 3: JWT Strategy and Guards

**Files:**
- Create: `src/auth/strategies/jwt.strategy.ts`
- Create: `src/auth/guards/jwt-auth.guard.ts`
- Create: `src/auth/decorators/public.decorator.ts`
- Create: `src/auth/decorators/current-user.decorator.ts`

- [ ] **Step 1: Create JWT Strategy**

`src/auth/strategies/jwt.strategy.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    return { ...user, tenantId: payload.tenantId };
  }
}
```

- [ ] **Step 2: Create Public decorator**

`src/auth/decorators/public.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 3: Create JwtAuthGuard**

`src/auth/guards/jwt-auth.guard.ts`:
```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
```

- [ ] **Step 4: Create CurrentUser decorator**

`src/auth/decorators/current-user.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 5: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/auth/
git commit -m "feat: add JWT strategy, JwtAuthGuard, @Public and @CurrentUser decorators"
```

---

## Task 4: AuthService (TDD)

**Files:**
- Create: `src/auth/auth.service.spec.ts`
- Create: `src/auth/auth.service.ts`

- [ ] **Step 1: Write failing tests**

`src/auth/auth.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockJwt = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const map: Record<string, unknown> = {
      'jwt.secret': 'test-secret',
      'jwt.expiresIn': '15m',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.refreshExpiresIn': '7d',
    };
    return map[key];
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'test@test.com' });

      await expect(
        service.register({ email: 'test@test.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates user and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@test.com',
        firstName: null,
        lastName: null,
      });
      mockJwt.signAsync.mockResolvedValue('mock-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({ email: 'new@test.com', password: 'password123' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe('new@test.com');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'no@test.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm test src/auth/auth.service.spec.ts --no-coverage 2>&1
```

Expected: FAIL — `Cannot find module './auth.service'`

- [ ] **Step 3: Implement AuthService**

`src/auth/auth.service.ts`:
```typescript
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
      select: { id: true, email: true, passwordHash: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { passwordHash: _, ...safeUser } = user;
    return this.issueTokens(safeUser);
  }

  async refresh(rawRefreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(rawRefreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const crypto = await import('crypto');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub, revokedAt: null },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token not found or expired');
    }

    // Revoke used token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get<string>('jwt.expiresIn'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      }),
    ]);

    const crypto = await import('crypto');
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
      },
    };
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test src/auth/auth.service.spec.ts --no-coverage 2>&1
```

Expected: PASS — at least 4 tests pass.

- [ ] **Step 5: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/
git commit -m "feat: add AuthService with register, login, refresh, logout and argon2 hashing"
```

---

## Task 5: AuthController and AuthModule

**Files:**
- Create: `src/auth/auth.controller.ts`
- Create: `src/auth/auth.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create AuthController**

`src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all refresh tokens for current user' })
  logout(@CurrentUser() user: { id: string }): Promise<void> {
    return this.authService.logout(user.id);
  }
}
```

- [ ] **Step 2: Create AuthModule**

`src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 3: Register AuthModule in AppModule**

Read `src/app.module.ts` and add `AuthModule` to imports:

```typescript
import { AuthModule } from './auth/auth.module';
```

Add `AuthModule` at the end of the imports array.

- [ ] **Step 4: Run all tests**

```bash
pnpm test --no-coverage 2>&1
```

Expected: All tests pass.

- [ ] **Step 5: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

- [ ] **Step 6: Boot app and verify auth routes appear in Swagger**

```bash
PORT=3001 pnpm start:dev &
APP_PID=$!
sleep 8
curl -s http://localhost:3001/api/docs-json | python3 -c "import json,sys; d=json.load(sys.stdin); paths=list(d.get('paths',{}).keys()); [print(p) for p in paths]"
kill $APP_PID 2>/dev/null || true
wait $APP_PID 2>/dev/null || true
```

Expected output includes: `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`

- [ ] **Step 7: Commit**

```bash
git add src/auth/ src/app.module.ts
git commit -m "feat: add AuthController and AuthModule with global JwtAuthGuard"
```

---

## Task 6: RBAC Decorators and Middleware

**Files:**
- Create: `src/rbac/decorators/roles.decorator.ts`
- Create: `src/rbac/decorators/permissions.decorator.ts`
- Create: `src/rbac/decorators/current-tenant.decorator.ts`
- Create: `src/rbac/middleware/tenant-context.middleware.ts`

- [ ] **Step 1: Create Roles decorator**

`src/rbac/decorators/roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 2: Create Permissions decorator**

`src/rbac/decorators/permissions.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

- [ ] **Step 3: Create CurrentTenant decorator**

`src/rbac/decorators/current-tenant.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId as string | undefined;
  },
);
```

- [ ] **Step 4: Create TenantContextMiddleware**

`src/rbac/middleware/tenant-context.middleware.ts`:
```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request & { user?: { tenantId?: string }; tenantId?: string }, _res: Response, next: NextFunction): void {
    // Extract tenantId from authenticated user (set by JwtStrategy)
    // or from X-Tenant-ID header for unauthenticated pre-flight checks
    const tenantId =
      req.user?.tenantId ?? req.headers['x-tenant-id'] as string | undefined;

    req.tenantId = tenantId;
    next();
  }
}
```

- [ ] **Step 5: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add src/rbac/
git commit -m "feat: add RBAC decorators (@Roles, @Permissions, @CurrentTenant) and TenantContextMiddleware"
```

---

## Task 7: RBAC Guards and RbacModule

**Files:**
- Create: `src/rbac/guards/roles.guard.ts`
- Create: `src/rbac/guards/permissions.guard.ts`
- Create: `src/rbac/rbac.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create RolesGuard**

`src/rbac/guards/roles.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { id: string };
      tenantId?: string;
    }>();

    const userId = request.user?.id;
    const tenantId = request.tenantId;

    if (!userId || !tenantId) {
      return false;
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!member) {
      return false;
    }

    const userRoles = member.roles.map((r) => r.role.name);
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
```

- [ ] **Step 2: Create PermissionsGuard**

`src/rbac/guards/permissions.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { id: string };
      tenantId?: string;
    }>();

    const userId = request.user?.id;
    const tenantId = request.tenantId;

    if (!userId || !tenantId) {
      return false;
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!member) {
      return false;
    }

    const userPermissions = member.roles.flatMap((r) =>
      r.role.permissions.map((p) => p.permission.action),
    );

    return requiredPermissions.every((perm) => userPermissions.includes(perm));
  }
}
```

- [ ] **Step 3: Create RbacModule**

`src/rbac/rbac.module.ts`:
```typescript
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantContextMiddleware } from './middleware/tenant-context.middleware';

@Module({
  providers: [
    RolesGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [RolesGuard, PermissionsGuard],
})
export class RbacModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
```

- [ ] **Step 4: Register RbacModule in AppModule**

Read `src/app.module.ts` and add `RbacModule` to imports:

```typescript
import { RbacModule } from './rbac/rbac.module';
```

Add `RbacModule` after `AuthModule` in the imports array.

- [ ] **Step 5: Run all tests**

```bash
pnpm test --no-coverage 2>&1
```

Expected: All tests pass.

- [ ] **Step 6: TypeScript check**

```bash
pnpm exec tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/rbac/ src/app.module.ts
git commit -m "feat: add RolesGuard, PermissionsGuard, TenantContextMiddleware, and RbacModule"
```

---

## Task 8: Phase 2 Integration Verification

- [ ] **Step 1: Run all tests**

```bash
pnpm test --no-coverage 2>&1
```

Expected: All tests pass.

- [ ] **Step 2: Run E2E tests**

```bash
pnpm test:e2e 2>&1
```

Expected: 1 test passes.

- [ ] **Step 3: Boot app and verify auth + Swagger**

```bash
PORT=3001 pnpm start:dev &
APP_PID=$!
sleep 8

echo "=== Auth routes in Swagger ==="
curl -s http://localhost:3001/api/docs-json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for path in sorted(d.get('paths', {}).keys()):
    print(path)
"

echo ""
echo "=== Unauthenticated route returns 401 ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1

echo ""
echo "=== Public register route returns 201 (POST with invalid body = 400, but not 401) ==="
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d "{}"

kill $APP_PID 2>/dev/null || true
wait $APP_PID 2>/dev/null || true
```

Expected:
- `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/refresh`, `/api/v1/auth/logout` present in Swagger
- `GET /api/v1` returns `401` (protected by global JwtAuthGuard)
- `POST /api/v1/auth/register` with empty body returns `400` (public route, but ValidationPipe rejects empty body) — NOT `401`

- [ ] **Step 4: Final commit tag**

```bash
git log --oneline | head -10
```

Report the final list of commits for Phase 2.

---

## Phase 2 Verification Checklist

1. All unit tests pass (`pnpm test`)
2. E2E test passes (`pnpm test:e2e`)
3. `GET /api/v1` → `401` (global guard active)
4. `POST /api/v1/auth/register` with empty body → `400` (public route, validation rejects)
5. Swagger at `/api/docs` shows Auth tag with 4 endpoints
6. `@Roles('admin')` on a route → `403` when user has no role in that tenant
7. `@Permissions('orders:read')` on a route → `403` when user lacks that permission
