import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdentityService } from '../identity/identity.service';
import { HrisEmployeeService } from './hris-employee.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RbacGuard } from './rbac.guard';
import { RequirePermissions } from './require-permissions.decorator';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermissions('users.manage')
export class HrisSyncController {
  constructor(private readonly hris: HrisEmployeeService, private readonly identity: IdentityService) {}

  @Post('sync-hris')
  @HttpCode(200)
  @ApiOperation({ summary: 'Synchronize employee profiles from HRIS' })
  async syncHris() {
    const profiles = await this.hris.listAll();
    const result = await this.identity.syncHrisEmployees(profiles);
    return { status: true, message: 'HRIS synchronization completed.', ...result };
  }
}
