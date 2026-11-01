import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity } from '../identity/entities/permission.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { DirectoryController } from './directory.controller';
import { AuditLogEntity } from './entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity, PermissionEntity, AuditLogEntity])],
  controllers: [AccessController, DirectoryController],
  providers: [AccessService],
})
export class AccessModule {}
