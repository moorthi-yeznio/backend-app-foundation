import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';

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
export class RbacModule {}
