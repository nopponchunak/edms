import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PermissionEntity } from '../identity/entities/permission.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';
import { AccessService } from './access.service';
import { AuditLogEntity } from './entities/audit-log.entity';

describe('AccessService', () => {
  const userRepository = { findOne: jest.fn(), save: jest.fn() };
  const roleRepository = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
  const permissionRepository = { find: jest.fn(), findBy: jest.fn() };
  const auditRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === UserEntity) return userRepository;
      if (entity === RoleEntity) return roleRepository;
      if (entity === PermissionEntity) return permissionRepository;
      return auditRepository;
    }),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(async (operation) => operation(manager)),
  };
  const service = new AccessService(
    userRepository as unknown as Repository<UserEntity>,
    roleRepository as unknown as Repository<RoleEntity>,
    permissionRepository as unknown as Repository<PermissionEntity>,
    auditRepository as unknown as Repository<AuditLogEntity>,
    dataSource as unknown as DataSource,
  );

  beforeEach(() => jest.clearAllMocks());

  it('assigns validated roles and records the change in the same transaction', async () => {
    const employeeRole = { id: 3, code: 'employee', permissions: [] } as RoleEntity;
    const user = {
      id: 7,
      username: 'employee.one',
      displayName: 'Employee One',
      roles: [],
      isSuperAdmin: false,
    } as UserEntity;
    userRepository.findOne.mockResolvedValue(user);
    roleRepository.find.mockResolvedValue([employeeRole]);
    userRepository.save.mockImplementation(async (value) => value);

    const result = await service.updateUserRoles(7, ['employee'], {
      sub: '12',
      username: 'admin.one',
      roles: ['administrator'],
    });

    expect(result.data.roles).toEqual(['employee']);
    expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ roles: [employeeRole] }));
    expect(auditRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 12,
      actorUsername: 'admin.one',
      action: 'access.user_roles.updated',
      beforeState: { roleCodes: [] },
      afterState: { roleCodes: ['employee'] },
    }));
  });

  it('does not create an audit event when the assigned roles are unchanged', async () => {
    const employeeRole = { id: 3, code: 'employee', permissions: [] } as RoleEntity;
    userRepository.findOne.mockResolvedValue({
      id: 7,
      username: 'employee.one',
      displayName: 'Employee One',
      roles: [employeeRole],
      isSuperAdmin: false,
    });
    roleRepository.find.mockResolvedValue([employeeRole]);

    await service.updateUserRoles(7, ['employee'], { username: 'admin.one' });

    expect(userRepository.save).not.toHaveBeenCalled();
    expect(auditRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown role code', async () => {
    userRepository.findOne.mockResolvedValue({ id: 7, roles: [], isSuperAdmin: false });
    roleRepository.find.mockResolvedValue([]);

    await expect(service.updateUserRoles(7, ['unknown'], { roles: ['administrator'] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents a regular administrator from granting super admin', async () => {
    userRepository.findOne.mockResolvedValue({ id: 7, roles: [], isSuperAdmin: false });
    roleRepository.find.mockResolvedValue([{ code: 'super_admin' }]);

    await expect(service.updateUserRoles(7, ['super_admin'], { roles: ['administrator'] }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents changes to super admin permissions', async () => {
    roleRepository.findOne.mockResolvedValue({ id: 1, code: 'super_admin' });

    await expect(service.updateRolePermissions(1, [], { role: 'super_admin' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
