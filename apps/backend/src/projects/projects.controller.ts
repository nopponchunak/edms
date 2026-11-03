import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ProjectsService } from './projects.service';
import { ProjectsSyncService } from './projects-sync.service';

class SaveProjectDto {
  @IsString() @MinLength(1) @MaxLength(100) projectNo!: string;
  @IsString() @MinLength(1) @MaxLength(500) name!: string;
}

class StartSyncDto {
  @IsIn(['incremental', 'full']) mode!: 'incremental' | 'full';
}

class UpdateProjectDto extends SaveProjectDto {
  @IsIn(['active', 'inactive']) status!: 'active' | 'inactive';
}

type Actor = { user: { username: string } };

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ProjectsController {
  constructor(private readonly service: ProjectsService, private readonly sync: ProjectsSyncService) {}

  @Get('dropdown')
  @ApiOperation({ summary: 'Active projects for form dropdowns' })
  async dropdown(@Query('q') q?: string) {
    return { data: await this.service.list(q, false) };
  }

  @Get('sync')
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Progress and result of the last PMTS sync' })
  syncState() {
    return this.sync.state();
  }

  @Post('sync')
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'Start copying projects from PMTS (runs in the background)' })
  startSync(@Body() body: StartSyncDto, @Req() req: Actor) {
    return this.sync.start(body.mode, req.user.username);
  }

  @Get()
  @RequirePermissions('projects.manage')
  @ApiOperation({ summary: 'List all projects' })
  async list(@Query('q') q?: string) {
    return { data: await this.service.list(q, true) };
  }

  @Post()
  @RequirePermissions('projects.manage')
  create(@Body() body: SaveProjectDto, @Req() req: Actor) {
    return this.service.create(body.projectNo, body.name, req.user.username);
  }

  @Put(':id')
  @RequirePermissions('projects.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateProjectDto, @Req() req: Actor) {
    return this.service.update(id, body.projectNo, body.name, body.status, req.user.username);
  }
}
