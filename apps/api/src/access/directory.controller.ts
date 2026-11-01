import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserEntity } from '../identity/entities/user.entity';

@Controller('directory')
@UseGuards(JwtAuthGuard)
export class DirectoryController {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}

  @Get('users')
  @ApiOperation({ summary: 'Active employee directory (username, display name and employee code only)' })
  async listUsers(@Query('q') q?: string) {
    const qb = this.users.createQueryBuilder('u')
      .select(['u.username', 'u.displayName', 'u.code'])
      .where('u.status = :status', { status: 'active' })
      .andWhere('u.deletedAt IS NULL')
      .orderBy('u.displayName', 'ASC')
      .limit(2000);
    const search = q?.trim().slice(0, 100);
    if (search) {
      qb.andWhere('(u.username ILIKE :search OR u.displayName ILIKE :search)', { search: `%${search}%` });
    }
    const rows = await qb.getMany();
    return { data: rows.map((u) => ({ username: u.username, displayName: u.displayName, code: u.code })) };
  }
}
