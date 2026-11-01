import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { AllowanceActor, AllowanceService } from './allowance.service';
import { ApproveAllowanceDto } from './dto/approve-allowance.dto';
import { ListAllowancesDto } from './dto/list-allowances.dto';
import { SaveAllowanceDto } from './dto/save-allowance.dto';

@ApiTags('Allowance After 10 PM')
@ApiBearerAuth()
@Controller('allowances')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AllowanceController {
  constructor(private readonly service: AllowanceService) {}

  @Get()
  @RequirePermissions('allowance-after-10pm.view')
  @ApiOperation({ summary: 'List allowance records' })
  list(@Query() query: ListAllowancesDto, @Req() req: { user: AllowanceActor }) {
    return this.service.list(query, req.user);
  }

  @Get(':id')
  @RequirePermissions('allowance-after-10pm.view')
  @ApiOperation({ summary: 'Get allowance record by id' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AllowanceActor }) {
    return this.service.findOneFor(id, req.user);
  }

  @Post()
  @RequirePermissions('allowance-after-10pm.create')
  @ApiOperation({ summary: 'Create allowance record' })
  create(@Body() body: SaveAllowanceDto, @Req() req: { user: AllowanceActor }) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @RequirePermissions('allowance-after-10pm.create')
  @ApiOperation({ summary: 'Update allowance record' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SaveAllowanceDto,
    @Req() req: { user: AllowanceActor },
  ) {
    return this.service.update(id, body, req.user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve or reject allowance record' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveAllowanceDto,
    @Req() req: { user: AllowanceActor },
  ) {
    return this.service.approve(id, body, req.user);
  }

  @Delete(':id')
  @RequirePermissions('allowance-after-10pm.create')
  @ApiOperation({ summary: 'Delete draft allowance record' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AllowanceActor }) {
    return this.service.remove(id, req.user);
  }
}
