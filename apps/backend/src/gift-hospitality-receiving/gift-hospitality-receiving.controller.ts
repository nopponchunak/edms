import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReassignDto } from '../lifecycle/reassign';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ApproveGiftReceivingDto, ListGiftReceivingsDto, SaveGiftReceivingDto } from './dto/gift-hospitality-receiving.dto';
import { GiftActor, GiftReceivingService } from './gift-hospitality-receiving.service';

@ApiTags('Gift/Hospitality Receiving')
@ApiBearerAuth()
@Controller('gift-hospitality-receivings')
@UseGuards(JwtAuthGuard, RbacGuard)
export class GiftReceivingController {
  constructor(private readonly service: GiftReceivingService) {}

  @Get()
  @RequirePermissions('gift-hospitality-receiving.view')
  @ApiOperation({ summary: 'List gift/hospitality receiving requests' })
  list(@Query() query: ListGiftReceivingsDto, @Req() req: { user: GiftActor }) {
    return this.service.list(query, req.user);
  }

  @Get(':id')
  @RequirePermissions('gift-hospitality-receiving.view')
  @ApiOperation({ summary: 'Get a gift/hospitality receiving request' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: GiftActor }) {
    return this.service.findOneFor(id, req.user);
  }

  @Post()
  @RequirePermissions('gift-hospitality-receiving.create')
  @ApiOperation({ summary: 'Create a receiving request (draft or submitted)' })
  create(@Body() body: SaveGiftReceivingDto, @Req() req: { user: GiftActor }) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @RequirePermissions('gift-hospitality-receiving.create')
  @ApiOperation({ summary: 'Update a draft or rejected request' })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: SaveGiftReceivingDto, @Req() req: { user: GiftActor }) {
    return this.service.update(id, body, req.user);
  }

  @Get(':id/events')
  @RequirePermissions('gift-hospitality-receiving.view')
  @ApiOperation({ summary: 'Submission / revision / decision history with comments' })
  events(@Param('id', ParseIntPipe) id: number, @Req() req: { user: GiftActor }) {
    return this.service.events(id, req.user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Verify, acknowledge, approve or reject the step assigned to the signed-in user' })
  approve(@Param('id', ParseIntPipe) id: number, @Body() body: ApproveGiftReceivingDto, @Req() req: { user: GiftActor }) {
    return this.service.approve(id, body, req.user);
  }

  @Post(':id/reassign')
  @ApiOperation({ summary: 'Administrators only: give a step that is still waiting to someone else' })
  reassign(@Param('id', ParseIntPipe) id: number, @Body() body: ReassignDto, @Req() req: { user: GiftActor }) {
    return this.service.reassign(id, body, req.user);
  }

  @Delete(':id')
  @RequirePermissions('gift-hospitality-receiving.create')
  @ApiOperation({ summary: 'Delete a draft request' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: GiftActor }) {
    return this.service.remove(id, req.user);
  }
}
