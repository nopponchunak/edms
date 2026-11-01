import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CommitteesService } from './committees.service';

class SaveCommitteeDto {
  @IsString() @MinLength(1) @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

class SetMembersDto {
  @IsArray() @IsInt({ each: true }) employeeIds!: number[];
}

type Actor = { user: { username: string } };

@ApiTags('Committees')
@ApiBearerAuth()
@Controller('committees')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CommitteesController {
  constructor(private readonly service: CommitteesService) {}

  // Literal paths are declared before the ':id' routes so they win.
  @Get('employees/search')
  @RequirePermissions('committees.manage')
  @ApiOperation({ summary: 'Search employees to add to a committee' })
  async searchEmployees(@Query('q') q?: string) {
    return { data: await this.service.searchEmployees(q) };
  }

  @Get('dropdown/:ref')
  @ApiOperation({ summary: 'Members of a committee (id or name) formatted for form dropdowns' })
  async dropdown(@Param('ref') ref: string, @Query('q') q?: string) {
    return { data: await this.service.dropdown(ref, q) };
  }

  @Get()
  @RequirePermissions('committees.manage')
  @ApiOperation({ summary: 'List committees' })
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  @RequirePermissions('committees.manage')
  create(@Body() body: SaveCommitteeDto, @Req() req: Actor) {
    return this.service.create(body.name, body.description, req.user.username);
  }

  @Put(':id')
  @RequirePermissions('committees.manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: SaveCommitteeDto, @Req() req: Actor) {
    return this.service.update(id, body.name, body.description, req.user.username);
  }

  @Delete(':id')
  @RequirePermissions('committees.manage')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: Actor) {
    return this.service.remove(id, req.user.username);
  }

  @Get(':id/members')
  @RequirePermissions('committees.manage')
  async members(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.members(id) };
  }

  @Put(':id/members')
  @RequirePermissions('committees.manage')
  async setMembers(@Param('id', ParseIntPipe) id: number, @Body() body: SetMembersDto, @Req() req: Actor) {
    return { data: await this.service.setMembers(id, body.employeeIds, req.user.username) };
  }
}
