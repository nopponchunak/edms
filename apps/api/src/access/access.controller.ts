import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { AccessActor, AccessService } from './access.service';
import { ListUsersDto } from './dto/list-users.dto';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { UpdateLocalUserDto } from './dto/update-local-user.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';

@ApiTags('Access management')
@ApiBearerAuth()
@Controller('access')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('users')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'List users and their effective access' })
  listUsers(@Query() query: ListUsersDto) {
    return this.access.listUsers(query);
  }

  @Get('roles')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'List roles and assigned permissions' })
  listRoles() {
    return this.access.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'List available permissions' })
  listPermissions() {
    return this.access.listPermissions();
  }

  @Get('audit-logs')
  @RequirePermissions('system.manage')
  @ApiOperation({ summary: 'List access-management audit events' })
  listAuditLogs(@Query() query: ListAuditLogsDto) {
    return this.access.listAuditLogs(query);
  }

  @Patch('users/:id/profile')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Update profile fields of a local user account' })
  updateLocalUser(
    @Param('id', ParseIntPipe) userId: number,
    @Body() body: UpdateLocalUserDto,
    @Req() request: { user: AccessActor },
  ) {
    return this.access.updateLocalUser(userId, body, request.user);
  }

  @Put('users/:id/roles')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Replace roles assigned to a user' })
  updateUserRoles(
    @Param('id', ParseIntPipe) userId: number,
    @Body() body: UpdateUserRolesDto,
    @Req() request: { user: AccessActor },
  ) {
    return this.access.updateUserRoles(userId, body.roleCodes, request.user);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Replace permissions assigned to a role' })
  updateRolePermissions(
    @Param('id', ParseIntPipe) roleId: number,
    @Body() body: UpdateRolePermissionsDto,
    @Req() request: { user: AccessActor },
  ) {
    return this.access.updateRolePermissions(roleId, body.permissionCodes, request.user);
  }
}
