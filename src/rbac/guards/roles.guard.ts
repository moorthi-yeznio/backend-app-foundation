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
