import { DataSource, EntityManager } from 'typeorm';
import { EmployeeEntity } from './entities/employee.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { IdentityService } from './identity.service';

describe('IdentityService', () => {
  it('creates an LDAP employee/user without storing the password and assigns the employee role', async () => {
    const applicationPermission = { id: 4, code: 'applications.view' } as PermissionEntity;
    const employeeRole = { id: 3, code: 'employee', permissions: [applicationPermission] } as RoleEntity;
    const employeeRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue({}),
      save: jest.fn(async (value: EmployeeEntity) => Object.assign(value, { id: 10 })),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue({}),
      save: jest.fn(async (value: UserEntity) => Object.assign(value, { id: 20 })),
    };
    const roleRepository = { findOne: jest.fn().mockResolvedValue(employeeRole) };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmployeeEntity) return employeeRepository;
        if (entity === UserEntity) return userRepository;
        if (entity === RoleEntity) return roleRepository;
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (work: (entityManager: EntityManager) => unknown) => work(manager)),
    } as unknown as DataSource;
    const service = new IdentityService(dataSource);

    const result = await service.syncLdapLogin({
      username: 'auser',
      displayName: 'A User',
      firstName: 'A',
      lastName: 'User',
      email: 'A.User@Example.com',
      department: 'Engineering',
      employeeId: 'E001',
      active: true,
    });

    expect(result).toEqual({ userId: 20, roles: ['employee'], permissions: ['applications.view'] });
    expect(employeeRepository.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'E001', username: 'auser', departmentName: 'Engineering' }));
    expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      username: 'auser',
      email: 'a.user@example.com',
      passwordHash: null,
      authProvider: 'ldap',
      employeeId: 10,
      roles: [employeeRole],
    }));
  });

  it('upserts HRIS employees and skips duplicate source records', async () => {
    const existing = { id: 1, code: 'E001', username: 'existing', firstName: 'Old', lastName: 'Name' } as EmployeeEntity;
    const employeeRole = { id: 3, code: 'employee' } as RoleEntity;
    const employeeRepository = {
      find: jest.fn().mockResolvedValue([existing]),
      create: jest.fn().mockImplementation(() => ({})),
      save: jest.fn(async (values: EmployeeEntity[]) => values.map((value, index) => {
        value.id ??= index + 2;
        return value;
      })),
    };
    const userRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(() => ({})),
      save: jest.fn(async (values: UserEntity[]) => values),
    };
    const roleRepository = { findOne: jest.fn().mockResolvedValue(employeeRole) };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmployeeEntity) return employeeRepository;
        if (entity === UserEntity) return userRepository;
        if (entity === RoleEntity) return roleRepository;
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (work: (entityManager: EntityManager) => unknown) => work(manager)),
    } as unknown as DataSource;
    const service = new IdentityService(dataSource);

    const result = await service.syncHrisEmployees([
      { code: 'E001', username: 'existing', firstName: 'Updated', lastName: 'User', email: null, department: 'QA', active: true },
      { code: 'E002', username: 'new.user', firstName: 'New', lastName: 'User', email: 'NEW@EXAMPLE.COM', department: 'IT', active: 'Yes' },
      { code: 'E002', username: 'duplicate', firstName: 'Duplicate', lastName: 'User', email: null, department: null, active: true },
      { code: 'E003', username: 'second.user', firstName: 'Second', lastName: 'User', email: 'new@example.com', department: 'IT', active: true },
    ]);

    expect(result).toEqual({
      processed: 3,
      created: 2,
      updated: 1,
      skipped: 1,
      usersCreated: 3,
      usersUpdated: 0,
      usersSkipped: 0,
    });
    expect(existing).toEqual(expect.objectContaining({ firstName: 'Updated', departmentName: 'QA', active: 'yes' }));
    expect(employeeRepository.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ code: 'E002', username: 'new.user', email: 'new@example.com' }),
      expect.objectContaining({ code: 'E003', username: 'second.user', email: 'new@example.com' }),
    ]), { chunk: 250 });
    expect(userRepository.save).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ username: 'existing', employeeId: 1, roles: [employeeRole] }),
      expect.objectContaining({ username: 'new.user', email: 'new@example.com', authProvider: 'ldap', roles: [employeeRole] }),
      expect.objectContaining({ username: 'second.user', email: 'new@example.com', authProvider: 'ldap', roles: [employeeRole] }),
    ]), { chunk: 250 });
  });
});
