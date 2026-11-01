import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HrisEmployeeService } from './hris-employee.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LdapAuthService } from './ldap-auth.service';
import { LocalAuthService } from './local-auth.service';
import { IdentityModule } from '../identity/identity.module';
import { HrisSyncController } from './hris-sync.controller';
import { RbacGuard } from './rbac.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { AuthSessionService } from './auth-session.service';

@Global()
@Module({
  imports: [JwtModule.register({}), IdentityModule, TypeOrmModule.forFeature([AuthSessionEntity])],
  controllers: [AuthController, HrisSyncController],
  providers: [
    AuthService,
    LdapAuthService,
    LocalAuthService,
    HrisEmployeeService,
    JwtAuthGuard,
    RbacGuard,
    AuthSessionService,
  ],
  exports: [
    AuthService,
    HrisEmployeeService,
    JwtModule,
    JwtAuthGuard,
    RbacGuard,
  ],
})
export class AuthModule {}
