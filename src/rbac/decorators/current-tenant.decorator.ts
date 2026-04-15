import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface RequestWithTenant {
  tenantId?: string;
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenant>();
    return request.tenantId;
  },
);
