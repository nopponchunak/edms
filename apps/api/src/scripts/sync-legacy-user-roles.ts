import dataSource from '../database/data-source';
import { AuditLogEntity } from '../access/entities/audit-log.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';

interface LegacyUser {
  permission_id?: unknown;
  username?: unknown;
  code?: unknown;
  name?: unknown;
  email?: unknown;
  type?: unknown;
  status?: unknown;
}

const legacyRoleByPermissionId = new Map<number, string>([
  [2, 'super_admin'],
  [28, 'special_admin'], [27, 'executive'], [26, 'hr'], [25, 'administrative'],
  [24, 'secretary_admins'], [23, 'all_staff'], [22, 'engineers'], [21, 'di_md'],
  [20, 'ad_tl'], [19, 'accounting_admins'], [18, 'purchasing'], [17, 'secretary_2'],
  [16, 'secretary_1'], [15, 'staff'], [14, 'it'], [13, 'purchase_admins'],
  [12, 'secretary'], [11, 'purchasing'], [10, 'ims'], [3, 'employee'],
]);

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function label(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function legacyUsers(payload: unknown): LegacyUser[] {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data.filter((item): item is LegacyUser => typeof item === 'object' && item !== null) : [];
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const endpoint = process.env.LEGACY_EDMS_USER_URL?.trim()
    || 'https://api-edms.meinhardt.net/api/get_user';
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Legacy EDMS returned ${response.status}.`);
  const sourceUsers = legacyUsers(await response.json());

  await dataSource.initialize();
  try {
    const users = await dataSource.getRepository(UserEntity).find({ relations: { roles: true } });
    const roles = await dataSource.getRepository(RoleEntity).find();
    const rolesByCode = new Map(roles.map((role) => [role.code, role]));
    const byUsername = new Map(users.map((user) => [user.username.toLowerCase(), user]));
    const byCode = new Map(users.filter((user) => user.code).map((user) => [user.code!.toLowerCase(), user]));
    const byEmail = new Map(users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));
    const assignments = new Map<number, Set<string>>();
    let inactiveSource = 0;
    let excludedPending = 0;
    let unmatched = 0;
    let matched = 0;
    let roleLinksAdded = 0;
    let systemAdminUsersCreated = 0;
    let systemAdminUsersPromoted = 0;
    const newSystemAdmins: UserEntity[] = [];

    for (const source of sourceUsers) {
      if (text(source.status) !== 'yes') {
        inactiveSource += 1;
        continue;
      }
      const permissionId = number(source.permission_id);
      if (permissionId === 1) {
        excludedPending += 1;
        continue;
      }
      const roleCode = permissionId === null ? undefined : legacyRoleByPermissionId.get(permissionId);
      if (!roleCode) continue;
      const target = (text(source.username) ? byUsername.get(text(source.username)!) : undefined)
        ?? (text(source.code) ? byCode.get(text(source.code)!) : undefined)
        ?? (text(source.email) ? byEmail.get(text(source.email)!) : undefined);
      if (!target) {
        if (permissionId === 2) {
          const username = text(source.username);
          const role = rolesByCode.get('super_admin');
          if (!username) throw new Error('A legacy SYSTEM ADMIN account has no username.');
          if (!role) throw new Error('Role super_admin is not configured.');
          newSystemAdmins.push(dataSource.getRepository(UserEntity).create({
            username,
            code: text(source.code),
            email: text(source.email),
            displayName: label(source.name) ?? username,
            passwordHash: null,
            authProvider: text(source.type) === 'local' ? 'local' : 'ldap',
            status: 'active',
            isSuperAdmin: true,
            lastLoginAt: null,
            employeeId: null,
            roles: [role],
          }));
          systemAdminUsersCreated += 1;
          roleLinksAdded += 1;
          matched += 1;
          continue;
        }
        unmatched += 1;
        continue;
      }
      matched += 1;
      const roleCodes = assignments.get(target.id) ?? new Set<string>();
      roleCodes.add(roleCode);
      assignments.set(target.id, roleCodes);
    }

    const changedUsers: UserEntity[] = [];
    for (const user of users) {
      const mappedRoleCodes = assignments.get(user.id);
      if (!mappedRoleCodes) continue;
      const currentRoles = new Map((user.roles ?? []).map((role) => [role.code, role]));
      let changed = false;
      if (mappedRoleCodes.has('super_admin') && !user.isSuperAdmin) {
        user.isSuperAdmin = true;
        systemAdminUsersPromoted += 1;
        changed = true;
      }
      for (const roleCode of mappedRoleCodes) {
        if (currentRoles.has(roleCode)) continue;
        const role = rolesByCode.get(roleCode);
        if (!role) throw new Error(`Mapped role ${roleCode} is not configured.`);
        currentRoles.set(roleCode, role);
        roleLinksAdded += 1;
        changed = true;
      }
      if (changed) {
        user.roles = [...currentRoles.values()];
        changedUsers.push(user);
      }
    }

    const summary = {
      mode: apply ? 'apply' : 'dry-run',
      sourceUsers: sourceUsers.length,
      localUsers: users.length,
      matched,
      usersChanged: changedUsers.length,
      usersCreated: newSystemAdmins.length,
      roleLinksAdded,
      unmatched,
      inactiveSource,
      excludedPending,
      systemAdminUsersCreated,
      systemAdminUsersPromoted,
    };

    if (apply && (changedUsers.length || newSystemAdmins.length)) {
      await dataSource.transaction(async (manager) => {
        await manager.getRepository(UserEntity).save(newSystemAdmins, { chunk: 100 });
        await manager.getRepository(UserEntity).save(changedUsers, { chunk: 100 });
        const auditRepository = manager.getRepository(AuditLogEntity);
        await auditRepository.save(auditRepository.create({
          actorUserId: null,
          actorUsername: 'system:legacy-role-sync',
          action: 'access.legacy_user_roles.synced',
          targetType: 'access-control',
          targetId: null,
          targetLabel: 'legacy-edms-role-mapping',
          beforeState: null,
          afterState: summary,
        }));
      });
    }

    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await dataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown legacy role sync error.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
