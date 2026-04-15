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
      () =>
        this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - is the process up?' })
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe - is the DB reachable?' })
  readiness() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
    ]);
  }
}
