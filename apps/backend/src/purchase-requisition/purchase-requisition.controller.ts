import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ApprovePurchaseRequisitionDto, ListPurchaseRequisitionsDto, SavePurchaseRequisitionDto } from './dto/purchase-requisition.dto';
import { PrActor, PurchaseRequisitionService } from './purchase-requisition.service';

@ApiTags('Purchase Requisition')
@ApiBearerAuth()
@Controller('purchase-requisitions')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PurchaseRequisitionController {
  constructor(private readonly service: PurchaseRequisitionService) {}

  @Get()
  @RequirePermissions('purchase-requisition.view')
  @ApiOperation({ summary: 'List purchase requisitions' })
  list(@Query() query: ListPurchaseRequisitionsDto, @Req() req: { user: PrActor }) {
    return this.service.list(query, req.user);
  }

  @Get(':id')
  @RequirePermissions('purchase-requisition.view')
  @ApiOperation({ summary: 'Get a purchase requisition' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: PrActor }) {
    return this.service.findOneFor(id, req.user);
  }

  @Post()
  @RequirePermissions('purchase-requisition.create')
  @ApiOperation({ summary: 'Create a purchase requisition (draft or submitted)' })
  create(@Body() body: SavePurchaseRequisitionDto, @Req() req: { user: PrActor }) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @RequirePermissions('purchase-requisition.create')
  @ApiOperation({ summary: 'Update a draft or rejected request' })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: SavePurchaseRequisitionDto, @Req() req: { user: PrActor }) {
    return this.service.update(id, body, req.user);
  }

  @Get(':id/events')
  @RequirePermissions('purchase-requisition.view')
  @ApiOperation({ summary: 'Submission / revision / decision history with comments' })
  events(@Param('id', ParseIntPipe) id: number, @Req() req: { user: PrActor }) {
    return this.service.events(id, req.user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Verify, approve, acknowledge, act on or reject the step assigned to the signed-in user' })
  approve(@Param('id', ParseIntPipe) id: number, @Body() body: ApprovePurchaseRequisitionDto, @Req() req: { user: PrActor }) {
    return this.service.approve(id, body, req.user);
  }

  @Delete(':id')
  @RequirePermissions('purchase-requisition.create')
  @ApiOperation({ summary: 'Delete a draft request' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: PrActor }) {
    return this.service.remove(id, req.user);
  }
}
