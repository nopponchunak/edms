export interface ScopedUser {
  username?: string;
  role?: unknown;
  roles?: unknown;
  permissions?: unknown;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function isSuperAdmin(user: ScopedUser): boolean {
  return user.role === 'super_admin' || strings(user.roles).includes('super_admin');
}

export function isAdministrator(user: ScopedUser): boolean {
  return isSuperAdmin(user) || strings(user.roles).includes('administrator');
}

export function canViewAll(user: ScopedUser, permission: string): boolean {
  return isSuperAdmin(user) || strings(user.permissions).includes(permission);
}
