import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

type AuthenticatedRequest = {
  user?: {
    role?: unknown;
    roles?: unknown;
    permissions?: unknown;
  };
};

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const roles = Array.isArray(user?.roles)
      ? user.roles.filter((role): role is string => typeof role === 'string')
      : [];

    if (user?.role === 'super_admin' || roles.includes('super_admin')) {
      return true;
    }

    const permissions = new Set(
      Array.isArray(user?.permissions)
        ? user.permissions.filter(
            (permission): permission is string => typeof permission === 'string',
          )
        : [],
    );

    if (requiredPermissions.every((permission) => permissions.has(permission))) {
      return true;
    }

    throw new ForbiddenException('You do not have permission to access this resource.');
  }
}
