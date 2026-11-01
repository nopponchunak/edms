import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';

describe('RbacGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const contextFor = (user: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  const guard = new RbacGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset();
  });

  it('allows a legacy local super admin without explicit permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['users.manage']);

    expect(guard.canActivate(contextFor({ role: 'super_admin' }))).toBe(true);
  });

  it('allows access when all required permissions are present', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'applications.view',
      'users.manage',
    ]);

    expect(
      guard.canActivate(
        contextFor({
          roles: ['administrator'],
          permissions: ['applications.view', 'users.manage'],
        }),
      ),
    ).toBe(true);
  });

  it('rejects access when a required permission is missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['users.manage']);

    expect(() =>
      guard.canActivate(
        contextFor({
          roles: ['employee'],
          permissions: ['applications.view'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
