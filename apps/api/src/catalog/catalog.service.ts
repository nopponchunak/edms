import { Injectable } from '@nestjs/common';
import { EDMS_MODULES } from './catalog.data';

export interface CatalogPrincipal {
  role?: unknown;
  roles?: unknown;
  permissions?: unknown;
}

@Injectable()
export class CatalogService {
  list(category?: string, principal?: CatalogPrincipal) {
    const visibleModules = this.visibleModules(principal);
    const data = category
      ? visibleModules.filter((item) => item.category.toLowerCase() === category.toLowerCase())
      : visibleModules;
    return { data, total: data.length };
  }

  categories(principal?: CatalogPrincipal) {
    const counts = this.visibleModules(principal).reduce<Record<string, number>>((result, item) => {
      result[item.category] = (result[item.category] ?? 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }

  private visibleModules(principal?: CatalogPrincipal) {
    if (!principal) return [];

    const roles = Array.isArray(principal.roles)
      ? principal.roles.filter((role): role is string => typeof role === 'string')
      : [];
    if (principal.role === 'super_admin' || roles.includes('super_admin')) return EDMS_MODULES;

    const permissions = Array.isArray(principal.permissions)
      ? principal.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [];
    if (permissions.includes('applications.view')) return EDMS_MODULES;

    const permissionSet = new Set(permissions);
    return EDMS_MODULES.filter((module) => permissionSet.has(`${module.permissionPrefix}.view`));
  }
}
