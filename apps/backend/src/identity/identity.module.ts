import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity } from './entities/employee.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { IdentityService } from './identity.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeEntity, UserEntity, RoleEntity, PermissionEntity])],
  providers: [IdentityService],
  exports: [TypeOrmModule, IdentityService],
})
export class IdentityModule {}
