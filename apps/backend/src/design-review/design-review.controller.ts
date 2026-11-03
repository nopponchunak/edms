import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { ReassignDto } from '../lifecycle/reassign';
import { ApproveDesignReviewDto, ListDesignReviewsDto, SaveDesignReviewDto } from './dto/design-review.dto';
import { DESIGN_REVIEW_DISCIPLINES, DESIGN_REVIEW_FORMS } from './design-review.config';
import { DesignReviewActor, DesignReviewService } from './design-review.service';

@ApiTags('Design Review')
@ApiBearerAuth()
@Controller('design-reviews')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DesignReviewController {
  constructor(private readonly service: DesignReviewService) {}

  @Get('config')
  @RequirePermissions('design-review.view')
  @ApiOperation({ summary: 'Forms, checklist questions, document types and disciplines' })
  config() {
    return { forms: DESIGN_REVIEW_FORMS, disciplines: DESIGN_REVIEW_DISCIPLINES };
  }

  @Get()
  @RequirePermissions('design-review.view')
  @ApiOperation({ summary: 'List design reviews' })
  list(@Query() query: ListDesignReviewsDto, @Req() req: { user: DesignReviewActor }) {
    return this.service.list(query, req.user);
  }

  @Get(':id')
  @RequirePermissions('design-review.view')
  @ApiOperation({ summary: 'Get a design review' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: DesignReviewActor }) {
    return this.service.findOneFor(id, req.user);
  }

  @Post()
  @RequirePermissions('design-review.create')
  @ApiOperation({ summary: 'Create a design review (draft or submitted)' })
  create(@Body() body: SaveDesignReviewDto, @Req() req: { user: DesignReviewActor }) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @RequirePermissions('design-review.create')
  @ApiOperation({ summary: 'Update a draft or rejected review' })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: SaveDesignReviewDto, @Req() req: { user: DesignReviewActor }) {
    return this.service.update(id, body, req.user);
  }

  @Get(':id/events')
  @RequirePermissions('design-review.view')
  @ApiOperation({ summary: 'Submission / revision / decision history with comments' })
  events(@Param('id', ParseIntPipe) id: number, @Req() req: { user: DesignReviewActor }) {
    return this.service.events(id, req.user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Sign off or reject the step assigned to the signed-in user' })
  approve(@Param('id', ParseIntPipe) id: number, @Body() body: ApproveDesignReviewDto, @Req() req: { user: DesignReviewActor }) {
    return this.service.approve(id, body, req.user);
  }

  @Post(':id/reassign')
  @ApiOperation({ summary: 'Administrators only: give a step that is still waiting to someone else' })
  reassign(@Param('id', ParseIntPipe) id: number, @Body() body: ReassignDto, @Req() req: { user: DesignReviewActor }) {
    return this.service.reassign(id, body, req.user);
  }

  @Delete(':id')
  @RequirePermissions('design-review.create')
  @ApiOperation({ summary: 'Delete a draft review' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: DesignReviewActor }) {
    return this.service.remove(id, req.user);
  }
}
