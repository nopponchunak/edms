import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReassignDto } from '../lifecycle/reassign';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ApproveCharitableContributionDto } from './dto/approve-charitable-contribution.dto';
import { CharitableActor, CharitableContributionService } from './charitable-contribution.service';
import { ListCharitableContributionsDto, SaveCharitableContributionDto } from './dto/charitable-contribution.dto';

@ApiTags('Charitable Contribution')
@ApiBearerAuth()
@Controller('charitable-contributions')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CharitableContributionController {
  constructor(private readonly service: CharitableContributionService) {}

  @Get()
  @RequirePermissions('charitable-contribution.view')
  @ApiOperation({ summary: 'List charitable contribution requests' })
  list(@Query() query: ListCharitableContributionsDto, @Req() req: { user: CharitableActor }) {
    return this.service.list(query, req.user);
  }

  @Get(':id')
  @RequirePermissions('charitable-contribution.view')
  @ApiOperation({ summary: 'Get a charitable contribution request' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: CharitableActor }) {
    return this.service.findOneFor(id, req.user);
  }

  @Post()
  @RequirePermissions('charitable-contribution.create')
  @ApiOperation({ summary: 'Create a charitable contribution request (draft)' })
  create(@Body() body: SaveCharitableContributionDto, @Req() req: { user: CharitableActor }) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @RequirePermissions('charitable-contribution.create')
  @ApiOperation({ summary: 'Update a draft or rejected request' })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: SaveCharitableContributionDto, @Req() req: { user: CharitableActor }) {
    return this.service.update(id, body, req.user);
  }

  @Get(':id/events')
  @RequirePermissions('charitable-contribution.view')
  @ApiOperation({ summary: 'Submission / revision / decision history with comments' })
  events(@Param('id', ParseIntPipe) id: number, @Req() req: { user: CharitableActor }) {
    return this.service.events(id, req.user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Verify, approve, acknowledge or reject the step assigned to the signed-in user' })
  approve(@Param('id', ParseIntPipe) id: number, @Body() body: ApproveCharitableContributionDto, @Req() req: { user: CharitableActor }) {
    return this.service.approve(id, body, req.user);
  }

  @Post(':id/reassign')
  @ApiOperation({ summary: 'Administrators only: give a step that is still waiting to someone else' })
  reassign(@Param('id', ParseIntPipe) id: number, @Body() body: ReassignDto, @Req() req: { user: CharitableActor }) {
    return this.service.reassign(id, body, req.user);
  }

  @Delete(':id')
  @RequirePermissions('charitable-contribution.create')
  @ApiOperation({ summary: 'Delete a draft request' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: CharitableActor }) {
    return this.service.remove(id, req.user);
  }
}
