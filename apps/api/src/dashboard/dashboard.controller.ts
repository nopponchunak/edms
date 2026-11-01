import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogPrincipal, CatalogService } from '../catalog/catalog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('dashboard')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('summary')
  summary(@Req() request: { user: CatalogPrincipal }) {
    const modules = this.catalog.list(undefined, request.user).data;
    return {
      actions: 0,
      drafts: 0,
      pending: 0,
      completedThisMonth: 0,
      modulesAvailable: modules.filter((module) => module.status === 'available').length,
      modulesInMigration: modules.filter((module) => module.status === 'migration').length,
    };
  }
}
