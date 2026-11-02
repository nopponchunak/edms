import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AccessUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  code: string | null;
  initial: string | null;
  title: string | null;
  level: string | null;
  department: string | null;
  authProvider: 'ldap' | 'local';
  status: 'active' | 'inactive' | 'pending';
  lastLoginAt: string | null;
  roles: string[];
  permissions: string[];
}

export interface UpdateLocalUserPayload {
  displayName?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: 'active' | 'inactive' | 'pending';
}

export interface AccessRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface AccessPermission {
  id: number;
  code: string;
  name: string;
  description: string | null;
}

export interface AccessAuditLog {
  id: string;
  actorUserId: number | null;
  actorUsername: string;
  action: string;
  targetType: 'user' | 'role';
  targetId: number | null;
  targetLabel: string | null;
  beforeState: Record<string, string[]> | null;
  afterState: Record<string, string[]> | null;
  createdAt: string;
}

interface ListResponse<T> { data: T[]; }
interface UsersResponse extends ListResponse<AccessUser> {
  meta: { page: number; limit: number; total: number; pages: number };
}
interface ItemResponse<T> { data: T; }

@Injectable({ providedIn: 'root' })
export class AccessManagementService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/access`;

  listUsers(query = '', page = 1, limit = 25): Observable<UsersResponse> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (query.trim()) params = params.set('q', query.trim());
    return this.http.get<UsersResponse>(`${this.baseUrl}/users`, { params });
  }

  listRoles(): Observable<ListResponse<AccessRole>> {
    return this.http.get<ListResponse<AccessRole>>(`${this.baseUrl}/roles`);
  }

  listPermissions(): Observable<ListResponse<AccessPermission>> {
    return this.http.get<ListResponse<AccessPermission>>(`${this.baseUrl}/permissions`);
  }

  listAuditLogs(): Observable<ListResponse<AccessAuditLog>> {
    return this.http.get<ListResponse<AccessAuditLog>>(`${this.baseUrl}/audit-logs`, {
      params: new HttpParams().set('limit', 25),
    });
  }

  updateLocalUser(userId: number, payload: UpdateLocalUserPayload): Observable<ItemResponse<AccessUser>> {
    return this.http.patch<ItemResponse<AccessUser>>(`${this.baseUrl}/users/${userId}/profile`, payload);
  }

  updateUserRoles(userId: number, roleCodes: string[]): Observable<ItemResponse<AccessUser>> {
    return this.http.put<ItemResponse<AccessUser>>(`${this.baseUrl}/users/${userId}/roles`, { roleCodes });
  }

  updateRolePermissions(roleId: number, permissionCodes: string[]): Observable<ItemResponse<AccessRole>> {
    return this.http.put<ItemResponse<AccessRole>>(`${this.baseUrl}/roles/${roleId}/permissions`, { permissionCodes });
  }
}
