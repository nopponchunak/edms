import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApprovalsService } from './approvals.service';

@ApiTags('approvals')
@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Documents currently waiting for the signed-in user to verify or approve' })
  pending(@Req() req: { user: { username: string } }) {
    return this.service.pending(req.user.username);
  }
}
