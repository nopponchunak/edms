import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ApproveExpensesClaimDto } from './dto/approve-expenses-claim.dto';
import { ListExpensesClaimsDto } from './dto/list-expenses-claims.dto';
import { SaveExpensesClaimDto } from './dto/save-expenses-claim.dto';
import { ClaimActor, ExpensesClaimService } from './expenses-claim.service';

@ApiTags('Expenses Claim')
@ApiBearerAuth()
@Controller('expenses-claims')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ExpensesClaimController {
  constructor(private readonly service: ExpensesClaimService) {}

  @Get()
  @RequirePermissions('expenses-claim.view')
  @ApiOperation({ summary: 'List expenses claims' })
  list(@Query() query: ListExpensesClaimsDto, @Req() req: { user: ClaimActor }) {
    return this.service.list(query, req.user);
  }

  @Get(':id')
  @RequirePermissions('expenses-claim.view')
  @ApiOperation({ summary: 'Get expenses claim by id' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: ClaimActor }) {
    return this.service.findOneFor(id, req.user);
  }

  @Post()
  @RequirePermissions('expenses-claim.create')
  @ApiOperation({ summary: 'Create expenses claim' })
  create(@Body() body: SaveExpensesClaimDto, @Req() req: { user: ClaimActor }) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @RequirePermissions('expenses-claim.create')
  @ApiOperation({ summary: 'Update expenses claim' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SaveExpensesClaimDto,
    @Req() req: { user: ClaimActor },
  ) {
    return this.service.update(id, body, req.user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve or reject expenses claim' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveExpensesClaimDto,
    @Req() req: { user: ClaimActor },
  ) {
    return this.service.approve(id, body, req.user);
  }

  @Delete(':id')
  @RequirePermissions('expenses-claim.create')
  @ApiOperation({ summary: 'Delete draft expenses claim' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: ClaimActor }) {
    return this.service.remove(id, req.user);
  }
}
