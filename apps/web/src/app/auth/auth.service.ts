import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  userId?: number;
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  employeeId: string | null;
  role?: 'super_admin';
  roles?: string[];
  permissions?: string[];
  authProvider: 'ldap' | 'local';
}

interface LoginResponse {
  status: boolean;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  user: AuthUser;
}

interface RefreshResponse {
  status: boolean;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  userAccess: Pick<AuthUser, 'role' | 'roles' | 'permissions'>;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenKey = 'edms_access_token';
  private readonly refreshTokenKey = 'edms_refresh_token';
  private readonly userKey = 'edms_auth_user';
  private refreshInFlight?: Observable<string>;

  login(username: string, password: string): Observable<LoginResponse> {
    return this.authenticate('ldap', username, password);
  }

  loginLocal(username: string, password: string): Observable<LoginResponse> {
    return this.authenticate('local', username, password);
  }

  refreshAccessToken(): Observable<string> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const refreshToken = this.refreshToken();
    if (!refreshToken) return throwError(() => new Error('Refresh token is unavailable.'));

    const request = this.http.post<RefreshResponse>(`${environment.apiBaseUrl}/auth/refresh`, { refreshToken }).pipe(
      tap((response) => {
        sessionStorage.setItem(this.tokenKey, response.accessToken);
        sessionStorage.setItem(this.refreshTokenKey, response.refreshToken);
        const user = this.currentUser();
        if (user) {
          sessionStorage.setItem(this.userKey, JSON.stringify({ ...user, ...response.userAccess }));
        }
      }),
      map((response) => response.accessToken),
      finalize(() => { this.refreshInFlight = undefined; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.refreshInFlight = request;
    return request;
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessToken());
  }

  accessToken(): string | null {
    return sessionStorage.getItem(this.tokenKey);
  }

  refreshToken(): string | null {
    return sessionStorage.getItem(this.refreshTokenKey);
  }

  currentUser(): AuthUser | null {
    const value = sessionStorage.getItem(this.userKey);
    if (!value) return null;
    try { return JSON.parse(value) as AuthUser; }
    catch { return null; }
  }

  isAdministrator(): boolean {
    const user = this.currentUser();
    return user?.role === 'super_admin' || Boolean(user?.roles?.some((role) => role === 'super_admin' || role === 'administrator'));
  }

  isSuperAdministrator(): boolean {
    const user = this.currentUser();
    return user?.role === 'super_admin' || Boolean(user?.roles?.includes('super_admin'));
  }

  hasPermission(permission: string): boolean {
    return this.isSuperAdministrator() || Boolean(this.currentUser()?.permissions?.includes(permission));
  }

  canViewModule(permissionPrefix: string): boolean {
    return this.hasPermission('applications.view') || this.hasPermission(`${permissionPrefix}.view`);
  }

  canManageAccess(): boolean {
    return this.isSuperAdministrator() || (this.hasPermission('users.manage') && this.hasPermission('roles.manage'));
  }

  logout(): void {
    const refreshToken = this.refreshToken();
    this.clearSession();
    if (refreshToken) {
      this.http.post(`${environment.apiBaseUrl}/auth/logout`, { refreshToken }).subscribe({
        error: () => undefined,
      });
    }
  }

  clearSession(): void {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.refreshTokenKey);
    sessionStorage.removeItem(this.userKey);
  }

  private authenticate(provider: 'ldap' | 'local', username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBaseUrl}/auth/${provider}/login`, { username, password }).pipe(
      tap((response) => {
        sessionStorage.setItem(this.tokenKey, response.accessToken);
        sessionStorage.setItem(this.refreshTokenKey, response.refreshToken);
        sessionStorage.setItem(this.userKey, JSON.stringify(response.user));
      }),
    );
  }
}
