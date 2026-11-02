import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DataSource, EntityManager, FindOptionsWhere, ILike } from 'typeorm';
import { EmployeeEntity } from './entities/employee.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';

export interface LdapDatabaseProfile {
  username: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  department: string | null;
  employeeId: string | null;
  active: string | boolean | null;
}

export interface DatabaseIdentity {
  userId: number;
  roles: string[];
  permissions: string[];
}

export interface HrisSyncProfile {
  code: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  department: string | null;
  initial?: string | null;
  title?: string | null;
  level?: string | null;
  active: string | boolean | null;
}

@Injectable()
export class IdentityService {
  constructor(private readonly dataSource: DataSource) {}

  async syncLdapLogin(profile: LdapDatabaseProfile): Promise<DatabaseIdentity> {
    return this.dataSource.transaction((manager) => this.persistLdapIdentity(manager, profile));
  }

  async getDatabaseIdentity(userId: number): Promise<DatabaseIdentity | null> {
    const user = await this.dataSource.getRepository(UserEntity).findOne({
      where: { id: userId, status: 'active' },
      relations: { roles: { permissions: true } },
    });
    if (!user) return null;
    const roles = (user.roles ?? []).map((role) => role.code).sort();
    const permissions = [...new Set(
      (user.roles ?? []).flatMap((role) =>
        (role.permissions ?? []).map((permission) => permission.code),
      ),
    )].sort();
    return { userId: user.id, roles, permissions };
  }

  async syncHrisEmployees(profiles: HrisSyncProfile[]): Promise<{
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    usersCreated: number;
    usersUpdated: number;
    usersSkipped: number;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmployeeEntity);
      const userRepository = manager.getRepository(UserEntity);
      const roleRepository = manager.getRepository(RoleEntity);
      const existing = await repository.find({ withDeleted: true });
      const byCode = new Map(existing.filter((item) => item.code).map((item) => [item.code!.toLowerCase(), item]));
      const byUsername = new Map(existing.filter((item) => item.username).map((item) => [item.username!.toLowerCase(), item]));
      const seen = new Set<string>();
      const records: EmployeeEntity[] = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const profile of profiles) {
        const codeKey = profile.code?.trim().toLowerCase() || null;
        const usernameKey = profile.username?.trim().toLowerCase() || null;
        const identityKey = codeKey ? `code:${codeKey}` : usernameKey ? `username:${usernameKey}` : null;
        if (!identityKey || seen.has(identityKey)) { skipped += 1; continue; }
        seen.add(identityKey);
        let employee = (codeKey ? byCode.get(codeKey) : undefined) ?? (usernameKey ? byUsername.get(usernameKey) : undefined);
        if (employee) updated += 1;
        else { employee = repository.create(); created += 1; }
        employee.code = profile.code?.trim() || null;
        employee.username = profile.username?.trim() || null;
        employee.firstName = profile.firstName?.trim() || profile.username?.trim() || profile.code?.trim() || 'Unknown';
        employee.lastName = profile.lastName?.trim() || '-';
        employee.email = this.normalizeEmail(profile.email);
        employee.departmentId = null;
        employee.departmentName = profile.department;
        employee.titleName ??= null;
        employee.initial = profile.initial?.trim() || employee.initial || null;
        employee.titleName = profile.title?.trim() || employee.titleName || null;
        employee.levelName = profile.level?.trim() || employee.levelName || null;
        employee.employeeStatus = this.activeValue(profile.active) === 'yes' ? 'active' : 'inactive';
        employee.active = this.activeValue(profile.active);
        employee.isApprover ??= false;
        employee.hrisUpdatedAt = new Date();
        employee.deletedAt = null;
        records.push(employee);
      }

      if (records.length) await repository.save(records, { chunk: 250 });

      const employeeRole = await roleRepository.findOne({ where: { code: 'employee' } });
      if (!employeeRole) throw new InternalServerErrorException('The employee role is not configured.');
      const existingUsers = await userRepository.find({
        relations: { roles: true },
        withDeleted: true,
      });
      const usersByEmployee = new Map(existingUsers.filter((user) => user.employeeId).map((user) => [user.employeeId!, user]));
      const usersByUsername = new Map(existingUsers.map((user) => [user.username.toLowerCase(), user]));
      const usersToSave: UserEntity[] = [];
      const seenUsernames = new Set<string>();
      let usersCreated = 0;
      let usersUpdated = 0;
      let usersSkipped = 0;

      for (const employee of records) {
        const username = employee.username?.trim();
        const usernameKey = username?.toLowerCase();
        if (!username || !usernameKey || seenUsernames.has(usernameKey)) {
          usersSkipped += 1;
          continue;
        }
        seenUsernames.add(usernameKey);

        let user = (employee.id ? usersByEmployee.get(employee.id) : undefined) ?? usersByUsername.get(usernameKey);
        if (user?.authProvider === 'local') {
          usersSkipped += 1;
          continue;
        }
        if (user) usersUpdated += 1;
        else {
          user = userRepository.create();
          usersCreated += 1;
        }

        user.username = username;
        user.code = employee.code;
        user.email = this.normalizeEmail(employee.email);
        user.displayName = `${employee.firstName} ${employee.lastName}`.trim();
        user.passwordHash = null;
        user.authProvider = 'ldap';
        user.status = employee.active === 'yes' ? 'active' : 'inactive';
        user.isSuperAdmin ??= false;
        user.lastLoginAt ??= null;
        user.employeeId = employee.id;
        user.employee = employee;
        user.roles = this.mergeRoles(user.roles ?? [], employeeRole);
        user.deletedAt = null;
        usersToSave.push(user);
      }

      if (usersToSave.length) await userRepository.save(usersToSave, { chunk: 250 });
      return {
        processed: records.length,
        created,
        updated,
        skipped,
        usersCreated,
        usersUpdated,
        usersSkipped,
      };
    });
  }

  private async persistLdapIdentity(manager: EntityManager, profile: LdapDatabaseProfile): Promise<DatabaseIdentity> {
    const employeeRepository = manager.getRepository(EmployeeEntity);
    const userRepository = manager.getRepository(UserEntity);
    const roleRepository = manager.getRepository(RoleEntity);
    const normalizedUsername = profile.username.trim();
    const employeeWhere: FindOptionsWhere<EmployeeEntity>[] = [{ username: ILike(normalizedUsername) }];
    if (profile.employeeId) employeeWhere.unshift({ code: profile.employeeId });

    let employee = await employeeRepository.findOne({ where: employeeWhere, withDeleted: true });
    employee ??= employeeRepository.create();
    const names = this.resolveNames(profile);
    employee.code = profile.employeeId;
    employee.username = normalizedUsername;
    employee.firstName = names.firstName;
    employee.lastName = names.lastName;
    employee.email = this.normalizeEmail(profile.email);
    employee.departmentId = null;
    employee.departmentName = profile.department;
    employee.titleName ??= null;
    employee.levelName ??= null;
    employee.employeeStatus = this.activeValue(profile.active) === 'yes' ? 'active' : 'inactive';
    employee.active = this.activeValue(profile.active);
    employee.isApprover ??= false;
    employee.hrisUpdatedAt = new Date();
    employee.deletedAt = null;
    employee = await employeeRepository.save(employee);

    const userWhere: FindOptionsWhere<UserEntity>[] = [{ username: ILike(normalizedUsername) }];
    if (employee.id) userWhere.unshift({ employeeId: employee.id });
    let user = await userRepository.findOne({ where: userWhere, relations: { roles: { permissions: true } }, withDeleted: true });
    user ??= userRepository.create();
    user.username = normalizedUsername;
    user.code = profile.employeeId;
    user.email = this.normalizeEmail(profile.email);
    const isNewUser = !user.id;
    const hasProperName = !!(profile.firstName?.trim() && profile.lastName?.trim());
    const properDisplayName = hasProperName ? `${profile.firstName!.trim()} ${profile.lastName!.trim()}` : null;
    // For existing users: only update displayName if LDAP has real givenName+sn (preserves admin-set names)
    // For new users: use proper LDAP name if available, else fall back to LDAP displayName
    user.displayName = isNewUser
      ? (properDisplayName || profile.displayName)
      : (properDisplayName ?? user.displayName);
    user.passwordHash = null;
    user.authProvider = 'ldap';
    user.status = 'active';
    user.employeeId = employee.id;
    user.employee = employee;
    user.lastLoginAt = new Date();
    user.deletedAt = null;

    const employeeRole = await roleRepository.findOne({ where: { code: 'employee' }, relations: { permissions: true } });
    if (!employeeRole) throw new InternalServerErrorException('The employee role is not configured.');
    const assignedRoles = this.mergeRoles(user.roles ?? [], employeeRole);
    user.roles = assignedRoles;
    user = await userRepository.save(user);

    const effectiveRoles = user.roles ?? assignedRoles;
    const roles = effectiveRoles.map((role) => role.code).sort();
    const permissions = [...new Set(effectiveRoles.flatMap((role) => (role.permissions ?? []).map((permission: PermissionEntity) => permission.code)))].sort();
    return { userId: user.id, roles, permissions };
  }

  private resolveNames(profile: LdapDatabaseProfile): { firstName: string; lastName: string } {
    const displayParts = profile.displayName.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: profile.firstName?.trim() || displayParts.shift() || profile.username,
      lastName: profile.lastName?.trim() || displayParts.join(' ') || '-',
    };
  }

  private normalizeEmail(value: string | null): string | null {
    return value?.trim().toLowerCase() || null;
  }

  private activeValue(value: string | boolean | null): string {
    if (value === false) return 'no';
    if (typeof value === 'string' && ['0', 'no', 'false', 'inactive', 'n'].includes(value.trim().toLowerCase())) return 'no';
    return 'yes';
  }

  private mergeRoles(current: RoleEntity[], required: RoleEntity): RoleEntity[] {
    const roles = new Map(current.map((role) => [role.code, role]));
    roles.set(required.code, required);
    return [...roles.values()];
  }
}
