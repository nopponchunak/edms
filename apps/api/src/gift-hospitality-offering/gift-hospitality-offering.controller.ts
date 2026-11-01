import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ApproveGiftOfferingDto, ListGiftOfferingsDto, SaveGiftOfferingDto } from './dto/gift-hospitality-offering.dto';
import { OfferingActor, GiftOfferingService } from './gift-hospitality-offering.service';

@ApiTags('Gift/Hospitality Offering')
@ApiBearerAuth()
@Controller('gift-hospitality-offerings')
@UseGuards(JwtAuthGuard, RbacGuard)
export class GiftOfferingController {
  constructor(private readonly service: GiftOfferingService) {}

  @Get()
  @RequirePermissions('gift-hospitality-offering.view')
  @ApiOperation({ summary: 'List gift/hospitality offering requests' })
  list(@Query() query: ListGiftOfferingsDto, @Req() req: { user: OfferingActor }) {
    return this.service.list(query, req.user);
  }

  @Get(':id')
  @RequirePermissions('gift-hospitality-offering.view')
  @ApiOperation({ summary: 'Get a gift/hospitality offering request' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: OfferingActor }) {
    return this.service.findOneFor(id, req.user);
  }

  @Post()
  @RequirePermissions('gift-hospitality-offering.create')
  @ApiOperation({ summary: 'Create a offering request (draft or submitted)' })
  create(@Body() body: SaveGiftOfferingDto, @Req() req: { user: OfferingActor }) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @RequirePermissions('gift-hospitality-offering.create')
  @ApiOperation({ summary: 'Update a draft or rejected request' })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: SaveGiftOfferingDto, @Req() req: { user: OfferingActor }) {
    return this.service.update(id, body, req.user);
  }

  @Get(':id/events')
  @RequirePermissions('gift-hospitality-offering.view')
  @ApiOperation({ summary: 'Submission / revision / decision history with comments' })
  events(@Param('id', ParseIntPipe) id: number, @Req() req: { user: OfferingActor }) {
    return this.service.events(id, req.user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Verify, acknowledge, approve or reject the step assigned to the signed-in user' })
  approve(@Param('id', ParseIntPipe) id: number, @Body() body: ApproveGiftOfferingDto, @Req() req: { user: OfferingActor }) {
    return this.service.approve(id, body, req.user);
  }

  @Delete(':id')
  @RequirePermissions('gift-hospitality-offering.create')
  @ApiOperation({ summary: 'Delete a draft request' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: OfferingActor }) {
    return this.service.remove(id, req.user);
  }
}
