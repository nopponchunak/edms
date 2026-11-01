import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, scrypt } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PermissionEntity } from '../identity/entities/permission.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';
import { ListUsersDto } from './dto/list-users.dto';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { UpdateLocalUserDto } from './dto/update-local-user.dto';
import { AuditLogEntity } from './entities/audit-log.entity';

export interface AccessActor {
  sub?: unknown;
  username?: unknown;
  role?: unknown;
  roles?: unknown;
}

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissions: Repository<PermissionEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogs: Repository<AuditLogEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async listUsers(query: ListUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const builder = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.employee', 'employee')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.deletedAt IS NULL')
      .orderBy('user.displayName', 'ASC')
      .addOrderBy('user.username', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const search = query.q?.trim();
    if (search) {
      builder.andWhere(
        '(user.username ILIKE :search OR user.displayName ILIKE :search OR user.email ILIKE :search OR employee.code ILIKE :search OR employee.initial ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [users, total] = await builder.getManyAndCount();
    return {
      data: users.map((user) => this.userResponse(user)),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async listRoles() {
    const roles = await this.roles.find({
      relations: { permissions: true },
      order: { name: 'ASC' },
    });
    return { data: roles.map((role) => this.roleResponse(role)) };
  }

  async listPermissions() {
    const permissions = await this.permissions.find({ order: { code: 'ASC' } });
    return { data: permissions.map((permission) => this.permissionResponse(permission)) };
  }

  async listAuditLogs(query: ListAuditLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const builder = this.auditLogs
      .createQueryBuilder('audit')
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.targetType) {
      builder.where('audit.targetType = :targetType', { targetType: query.targetType });
    }
    const [logs, total] = await builder.getManyAndCount();
    return {
      data: logs.map((log) => ({
        id: log.id,
        actorUserId: log.actorUserId,
        actorUsername: log.actorUsername,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        targetLabel: log.targetLabel,
        beforeState: log.beforeState,
        afterState: log.afterState,
        createdAt: log.createdAt,
      })),
      meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async updateLocalUser(userId: number, body: UpdateLocalUserDto, actor: AccessActor) {
    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const user = await users.findOne({
        where: { id: userId },
        relations: { employee: true, roles: { permissions: true } },
      });
      if (!user) throw new NotFoundException('User was not found.');
      if (user.authProvider !== 'local' && body.password) {
        throw new BadRequestException('Password cannot be changed for LDAP accounts.');
      }

      const before: Record<string, string[]> = {};
      const after: Record<string, string[]> = {};

      if (body.displayName !== undefined && body.displayName !== user.displayName) {
        before['displayName'] = [user.displayName];
        user.displayName = body.displayName;
        after['displayName'] = [user.displayName];
      }
      if (body.email !== undefined && body.email !== user.email) {
        before['email'] = [user.email ?? ''];
        user.email = body.email;
        after['email'] = [user.email ?? ''];
      }
      if (body.phone !== undefined && body.phone !== user.phone) {
        before['phone'] = [user.phone ?? ''];
        user.phone = body.phone || null;
        after['phone'] = [user.phone ?? ''];
      }
      if (body.status !== undefined && body.status !== user.status) {
        before['status'] = [user.status];
        user.status = body.status;
        after['status'] = [user.status];
      }
      if (body.password) {
        user.passwordHash = await this.hashPassword(body.password);
        after['password'] = ['(changed)'];
      }

      await users.save(user);

      if (Object.keys(after).length > 0) {
        await this.recordAudit(manager, actor, {
          action: 'access.user_profile.updated',
          targetType: 'user',
          targetId: user.id,
          targetLabel: user.username,
          beforeState: before,
          afterState: after,
        });
      }

      return { data: this.userResponse(user) };
    });
  }

  async updateUserRoles(userId: number, roleCodes: string[], actor: AccessActor) {
    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const roles = manager.getRepository(RoleEntity);
      const user = await users.findOne({
        where: { id: userId },
        relations: { employee: true, roles: { permissions: true } },
      });
      if (!user) throw new NotFoundException('User was not found.');

      const requestedRoles = await roles.find({
        where: { code: In(roleCodes) },
        relations: { permissions: true },
      });
      if (requestedRoles.length !== roleCodes.length) {
        throw new BadRequestException('One or more role codes are invalid.');
      }

      const actorIsSuperAdmin = this.isSuperAdmin(actor);
      const currentlySuperAdmin = user.isSuperAdmin || Boolean(user.roles?.some((role) => role.code === 'super_admin'));
      const requestsSuperAdmin = requestedRoles.some((role) => role.code === 'super_admin');
      if (!actorIsSuperAdmin && (currentlySuperAdmin || requestsSuperAdmin)) {
        throw new ForbiddenException('Only a super administrator can change super administrator access.');
      }

      const before = (user.roles ?? []).map((role) => role.code).sort();
      const after = requestedRoles.map((role) => role.code).sort();
      if (!this.sameValues(before, after)) {
        user.roles = requestedRoles;
        await users.save(user);
        await this.recordAudit(manager, actor, {
          action: 'access.user_roles.updated',
          targetType: 'user',
          targetId: user.id,
          targetLabel: user.username,
          beforeState: { roleCodes: before },
          afterState: { roleCodes: after },
        });
      }
      user.roles = requestedRoles;
      return { data: this.userResponse(user) };
    });
  }

  async updateRolePermissions(roleId: number, permissionCodes: string[], actor: AccessActor) {
    return this.dataSource.transaction(async (manager) => {
      const roles = manager.getRepository(RoleEntity);
      const permissionRepository = manager.getRepository(PermissionEntity);
      const role = await roles.findOne({
        where: { id: roleId },
        relations: { permissions: true },
      });
      if (!role) throw new NotFoundException('Role was not found.');
      if (role.code === 'super_admin') {
        throw new ForbiddenException('Super administrator permissions cannot be changed.');
      }

      const permissions = permissionCodes.length
        ? await permissionRepository.findBy({ code: In(permissionCodes) })
        : [];
      if (permissions.length !== permissionCodes.length) {
        throw new BadRequestException('One or more permission codes are invalid.');
      }

      const before = (role.permissions ?? []).map((permission) => permission.code).sort();
      const after = permissions.map((permission) => permission.code).sort();
      if (!this.sameValues(before, after)) {
        role.permissions = permissions;
        await roles.save(role);
        await this.recordAudit(manager, actor, {
          action: 'access.role_permissions.updated',
          targetType: 'role',
          targetId: role.id,
          targetLabel: role.code,
          beforeState: { permissionCodes: before },
          afterState: { permissionCodes: after },
        });
      }
      role.permissions = permissions;
      return { data: this.roleResponse(role) };
    });
  }

  private hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const keyLen = 64;
    return new Promise((resolve, reject) => {
      scrypt(password, salt, keyLen, (error, derivedKey) => {
        if (error) reject(error);
        else resolve(`scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
      });
    });
  }

  private isSuperAdmin(actor: AccessActor): boolean {
    const roles = Array.isArray(actor.roles) ? actor.roles : [];
    return actor.role === 'super_admin' || roles.includes('super_admin');
  }

  private sameValues(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private async recordAudit(
    manager: EntityManager,
    actor: AccessActor,
    event: Pick<
      AuditLogEntity,
      'action' | 'targetType' | 'targetId' | 'targetLabel' | 'beforeState' | 'afterState'
    >,
  ): Promise<void> {
    const rawActorId = typeof actor.sub === 'string' || typeof actor.sub === 'number'
      ? Number(actor.sub)
      : Number.NaN;
    const actorUserId = Number.isSafeInteger(rawActorId) && rawActorId > 0 ? rawActorId : null;
    const actorUsername = typeof actor.username === 'string' && actor.username.trim()
      ? actor.username.trim()
      : typeof actor.sub === 'string'
        ? actor.sub
        : 'unknown';
    const repository = manager.getRepository(AuditLogEntity);
    await repository.save(repository.create({
      ...event,
      actorUserId,
      actorUsername,
    }));
  }

  private userResponse(user: UserEntity) {
    const roles = user.roles ?? [];
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      code: user.code,
      initial: user.employee?.initial ?? null,
      title: user.employee?.titleName ?? null,
      level: user.employee?.levelName ?? null,
      department: user.employee?.departmentName ?? null,
      authProvider: user.authProvider,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      roles: roles.map((role) => role.code).sort(),
      permissions: [
        ...new Set(
          roles.flatMap((role) =>
            (role.permissions ?? []).map((permission) => permission.code),
          ),
        ),
      ].sort(),
    };
  }

  private roleResponse(role: RoleEntity) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: (role.permissions ?? []).map((permission) => permission.code).sort(),
    };
  }

  private permissionResponse(permission: PermissionEntity) {
    return {
      id: permission.id,
      code: permission.code,
      name: permission.name,
      description: permission.description,
    };
  }
}
